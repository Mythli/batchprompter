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
        const { resolvedStep, stepContext, viewContext } = await this.stepResolver.resolve(
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
                    viewContext,
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

        // 3. Build Base Messages (System + History + User Prompt)
        // Note: We use accumulatedContent from previous steps as part of the user prompt if available
        const effectiveUserPromptParts = [
            ...item.accumulatedContent,
            ...resolvedStep.userPromptParts
        ];

        const currentMessages = this.messageBuilder.build(resolvedStep.modelConfig, viewContext, effectiveUserPromptParts);
        
        // Inject History
        const systemMsg = currentMessages.find(m => m.role === 'system');
        const userMsgs = currentMessages.filter(m => m.role !== 'system');
        
        const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
        if (systemMsg) baseMessages.push(systemMsg);
        baseMessages.push(...item.history);
        baseMessages.push(...userMsgs);

        // 4. Run Plugins (Preparation Phase) -> Explosion
        const messageSets = await this.pluginExecutor.runPreparationPhase(
            baseMessages,
            resolvedPlugins,
            viewContext,
            item.originalIndex,
            stepIndex
        );

        // 5. Execute Model (or Pass-through) for each message set
        const nextItems: PipelineItem[] = [];

        // Check if we have a prompt to execute
        const hasPrompt = resolvedStep.userPromptParts.length > 0 || item.accumulatedContent.length > 0;
        
        // If no prompt, we skip the model execution and treat the plugin output as the result.
        // However, we need to extract "data" from the messages if possible.
        // Since we can't easily extract structured data from messages without the LLM,
        // we will assume the "result" is the text content of the last message added by the plugin.

        for (let i = 0; i < messageSets.length; i++) {
            const messages = messageSets[i];
            const variationIndex = messageSets.length > 1 ? i : item.variationIndex;

            let resultData: any;
            let historyMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam;
            let explodedResults: any[] | undefined;

            if (hasPrompt) {
                // Execute Model
                const result = await this.stepExecutor.executeModel(
                    stepContext,
                    item.originalIndex,
                    stepNum,
                    resolvedStep,
                    messages,
                    variationIndex,
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
                events.emit('step:progress', { row: item.originalIndex, step: stepNum, type: 'info', message: 'No prompt provided. Skipping model execution.' });
                
                // Use the last message as the "result"
                const lastMsg = messages[messages.length - 1];
                const content = concatMessageText([lastMsg]);
                
                resultData = content;
                historyMessage = { role: 'assistant', content: '[Pass-through]' };
            }

            // 6. Process Results (Explosion & Output)
            // Handle Explicit Explosion (JSON Array from Model)
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
            // We create a temporary item for this variation
            const tempItem = { ...item, variationIndex };
            
            const processedItems = ResultProcessor.process(
                [tempItem],
                packets,
                resolvedStep.output,
                'modelOutput'
            );

            // Apply History Updates
            for (const newItem of processedItems) {
                const newHistory = [...newItem.history];
                
                // Add User Prompt if it exists (and wasn't already in history)
                // In this architecture, baseMessages included history.
                // We need to append the *new* parts (User Prompt + Assistant Response)
                
                // Re-construct what was added to history
                // The `messages` array contains everything.
                // We want to append the *difference* between `item.history` and `messages` + `historyMessage`.
                
                // Actually, simpler: `messages` IS the new history context (minus system).
                // But `messages` includes the system prompt which we don't store in `item.history`.
                
                // Let's just append the User Prompt and the Assistant Response.
                
                if (hasPrompt) {
                    // Add User Prompt (effective)
                    // We only add it if it's not empty
                    if (effectiveUserPromptParts.length > 0) {
                         newHistory.push({ role: 'user', content: effectiveUserPromptParts });
                    }
                    
                    // Add Assistant Response
                    newHistory.push(historyMessage);
                } else {
                    // In pass-through, we usually don't update history with a fake assistant message
                    // unless we want to record the plugin's output as context.
                    // But the plugin's output is ALREADY in `messages`.
                    
                    // If we want to persist the plugin's context for the next step:
                    // We should update `newItem.history` to match `messages` (excluding system).
                    
                    const nonSystemMessages = messages.filter(m => m.role !== 'system');
                    // This replaces the old history entirely with the new state (including plugin injections)
                    newItem.history = nonSystemMessages;
                }

                newItem.stepHistory = [...newItem.stepHistory, resultData];
                nextItems.push(newItem);
            }
        }

        return nextItems;
    }
}
