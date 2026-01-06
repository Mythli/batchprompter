import OpenAI from 'openai';
import { StepResolver } from './StepResolver.js';
import { PluginExecutor, ResolvedPlugin } from './PluginExecutor.js';
import { StepExecutor } from '../StepExecutor.js';
import { MessageBuilder } from './MessageBuilder.js';
import { PluginRegistryV2, PluginServices } from '../plugins/types.js';
import { GlobalContext, PipelineItem, StepConfig, StepContext } from '../types.js';
import { ResultProcessor } from './ResultProcessor.js';
import { ResolvedPluginBase } from '../config/types.js';
import { countChars, concatMessageText } from 'llm-fns';

export class StepOrchestrator {
    constructor(
        private globalContext: GlobalContext,
        private pluginRegistry: PluginRegistryV2,
        private stepResolver: StepResolver,
        private messageBuilder: MessageBuilder,
        private pluginExecutor: PluginExecutor,
        private stepExecutor: StepExecutor
    ) {}

    async processStep(
        item: PipelineItem,
        stepIndex: number,
        stepConfig: any, // Raw config from RuntimeConfig
        configTmpDir: string,
        pluginServices: PluginServices
    ): Promise<PipelineItem[]> {
        const stepNum = stepIndex + 1;
        const events = this.globalContext.events;

        // 1. Resolve Step Configuration
        const { resolvedStep, stepContext, viewContext: initialViewContext } = await this.stepResolver.resolve(
            item,
            stepConfig,
            stepIndex,
            configTmpDir
        );

        // 2. Resolve Plugins
        const resolvedPlugins: ResolvedPlugin[] = [];
        for (const pluginDef of resolvedStep.plugins) {
            const plugin = this.pluginRegistry.get(pluginDef.name);
            if (plugin) {
                const inheritedModel = {
                    model: resolvedStep.modelConfig.model || this.globalContext.defaultModel,
                    temperature: resolvedStep.modelConfig.temperature,
                    thinkingLevel: resolvedStep.modelConfig.thinkingLevel
                };

                const resolvedConfig = await plugin.resolveConfig(
                    pluginDef.config,
                    initialViewContext,
                    inheritedModel,
                    this.globalContext.contentResolver
                );
                
                const resolvedDef: ResolvedPluginBase = {
                    type: pluginDef.name,
                    id: (pluginDef.config as any).id || `${pluginDef.name}-${Date.now()}`,
                    output: pluginDef.output,
                    rawConfig: pluginDef.config
                };

                resolvedPlugins.push({ instance: plugin, config: resolvedConfig, def: resolvedDef });
            }
        }

        // 3. Run Plugins (Preparation Phase) -> Explosion & Data Merging
        // We pass the initial item. The executor returns a list of items (potentially exploded/modified).
        const processedItems = await this.pluginExecutor.runPreparationPhase(
            [item],
            resolvedPlugins,
            stepIndex
        );

        // 4. Execute Model (or Pass-through) for each processed item
        const nextItems: PipelineItem[] = [];

        for (const processedItem of processedItems) {
            // Re-construct view context because row/workspace might have changed
            const viewContext = {
                ...processedItem.row,
                ...processedItem.workspace,
                steps: processedItem.stepHistory,
                index: processedItem.originalIndex
            };

            // Build Messages for THIS specific item state
            const effectiveUserPromptParts = [
                ...processedItem.accumulatedContent,
                ...resolvedStep.userPromptParts
            ];

            const currentMessages = this.messageBuilder.build(resolvedStep.modelConfig, viewContext, effectiveUserPromptParts);
            
            // Inject History
            const systemMsg = currentMessages.find(m => m.role === 'system');
            const userMsgs = currentMessages.filter(m => m.role !== 'system');
            
            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
            if (systemMsg) messages.push(systemMsg);
            messages.push(...processedItem.history);
            messages.push(...userMsgs);

            // Check if we have a prompt to execute
            const hasPrompt = resolvedStep.userPromptParts.length > 0 || processedItem.accumulatedContent.length > 0;
            
            let resultData: any;
            let historyMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam;
            let explodedResults: any[] | undefined;

            if (hasPrompt) {
                // Execute Model
                const result = await this.stepExecutor.executeModel(
                    stepContext,
                    processedItem.originalIndex,
                    stepNum,
                    resolvedStep,
                    messages,
                    processedItem.variationIndex,
                    resolvedPlugins,
                    pluginServices,
                    resolvedStep.resolvedTempDir || configTmpDir
                );
                
                resultData = result.modelResult;
                historyMessage = result.historyMessage;
                if (result.explodedResults) {
                    explodedResults = result.explodedResults.map(r => r.raw !== undefined ? r.raw : r.columnValue);
                }

            } else {
                // Pass-through Mode
                events.emit('step:progress', { row: processedItem.originalIndex, step: stepNum, type: 'info', message: 'No prompt provided. Skipping model execution.' });
                
                // Use the last message as the "result"
                // Note: messages includes system, history, and user prompt.
                // If no user prompt parts, it might just be history.
                // But accumulatedContent > 0 check passed.
                const lastMsg = messages[messages.length - 1];
                const content = concatMessageText([lastMsg]);
                
                resultData = content;
                historyMessage = { role: 'assistant', content: '[Pass-through]' };
            }

            // 5. Process Results (Explosion & Output)
            let itemsToProcess: any[] = [];
            
            if (explodedResults) {
                itemsToProcess = explodedResults;
            } else if (resolvedStep.output.explode && Array.isArray(resultData)) {
                itemsToProcess = resultData;
            } else {
                itemsToProcess = [resultData];
            }

            // Map to PluginPackets for ResultProcessor
            const packets = itemsToProcess.map(data => ({
                data,
                contentParts: [], // We don't accumulate content from model output usually
            }));

            // Use ResultProcessor to apply data to items
            const finalItems = ResultProcessor.process(
                [processedItem],
                packets,
                resolvedStep.output,
                'modelOutput'
            );

            // Apply History Updates
            for (const newItem of finalItems) {
                const newHistory = [...newItem.history];
                
                if (hasPrompt) {
                    if (effectiveUserPromptParts.length > 0) {
                         newHistory.push({ role: 'user', content: effectiveUserPromptParts });
                    }
                    newHistory.push(historyMessage);
                } else {
                    // In pass-through, update history to match current state (excluding system)
                    const nonSystemMessages = messages.filter(m => m.role !== 'system');
                    newItem.history = nonSystemMessages;
                }

                newItem.stepHistory = [...newItem.stepHistory, resultData];
                nextItems.push(newItem);
            }
        }

        return nextItems;
    }
}
