import OpenAI from 'openai';
import { StepResolver } from './StepResolver.js';
import { PluginExecutor, ResolvedPlugin } from './PluginExecutor.js';
import { StepExecutor } from '../StepExecutor.js';
import { MessageBuilder } from './MessageBuilder.js';
import { PluginRegistryV2, PluginServices } from '../plugins/types.js';
import { GlobalContext, PipelineItem, StepExecutionState } from '../types.js';
import { ResultProcessor } from './ResultProcessor.js';
import { ResolvedPluginBase } from '../config/types.js';
import { concatMessageText } from 'llm-fns';

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

        // 3. Initialize StepExecutionState
        // We start with the resolved user prompt in 'content'
        const initialState: StepExecutionState = {
            history: item.history,
            content: [...resolvedStep.userPromptParts],
            context: { ...item.row, ...item.workspace }, // Working context starts with row + workspace
            row: { ...item.row }, // Final output starts with row
            originalIndex: item.originalIndex,
            variationIndex: item.variationIndex,
            stepHistory: item.stepHistory
        };

        // 4. Run Plugins (Preparation Phase) -> Explosion & Data Merging
        const processedStates = await this.pluginExecutor.runPreparationPhase(
            [initialState],
            resolvedPlugins,
            stepIndex
        );

        // 5. Execute Model (or Pass-through) for each processed state
        const nextItems: PipelineItem[] = [];

        for (const state of processedStates) {
            // Re-construct view context for message building (system prompt rendering)
            const viewContext = {
                ...state.context,
                steps: state.stepHistory,
                index: state.originalIndex
            };

            // Build Messages
            // Note: state.content already contains User Prompt + Plugin Content
            // We pass state.content as 'externalContent' to MessageBuilder, but MessageBuilder
            // also appends resolvedStep.userPromptParts if we aren't careful.
            // MessageBuilder.build takes (config, row, externalContent).
            // config.promptParts are the userPromptParts.
            // If we pass state.content as externalContent, we duplicate the prompt parts because we initialized state.content with them.
            
            // Fix: We should use MessageBuilder to build SYSTEM messages only, 
            // and construct the User message manually from state.content.
            
            // Or, we can pass empty promptParts to MessageBuilder and pass state.content as external.
            // Let's do the latter to reuse MessageBuilder's system prompt logic.
            const configForMessageBuilder = {
                ...resolvedStep.modelConfig,
                promptParts: [] // Clear prompt parts to avoid duplication
            };

            const currentMessages = this.messageBuilder.build(configForMessageBuilder, viewContext, state.content);
            
            // Inject History
            const systemMsg = currentMessages.find(m => m.role === 'system');
            const userMsgs = currentMessages.filter(m => m.role !== 'system');
            
            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
            if (systemMsg) messages.push(systemMsg);
            messages.push(...state.history);
            messages.push(...userMsgs);

            // Check if we have content to execute
            const hasContent = state.content.length > 0;
            
            let resultData: any;
            let historyMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam;
            let explodedResults: any[] | undefined;

            if (hasContent) {
                // Execute Model
                const result = await this.stepExecutor.executeModel(
                    stepContext,
                    state.originalIndex,
                    stepNum,
                    resolvedStep,
                    messages,
                    state.variationIndex,
                    resolvedPlugins,
                    pluginServices,
                    resolvedStep.resolvedTempDir || configTmpDir,
                    state.context // Pass working context for post-processing
                );
                
                resultData = result.modelResult;
                historyMessage = result.historyMessage;
                if (result.explodedResults) {
                    explodedResults = result.explodedResults.map(r => r.raw !== undefined ? r.raw : r.columnValue);
                }

            } else {
                // Pass-through Mode
                events.emit('step:progress', { row: state.originalIndex, step: stepNum, type: 'info', message: 'No prompt/content provided. Skipping model execution.' });
                
                // Use the last message as the "result" if available, or empty
                const lastMsg = messages[messages.length - 1];
                const content = lastMsg ? concatMessageText([lastMsg]) : "";
                
                resultData = content;
                historyMessage = { role: 'assistant', content: '[Pass-through]' };
            }

            // 6. Process Results (Explosion & Output)
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
                contentParts: [], // We don't accumulate content from model output
            }));

            // Use ResultProcessor to apply data to states
            const finalStates = ResultProcessor.process(
                [state],
                packets,
                resolvedStep.output,
                'modelOutput'
            );

            // Convert final states to PipelineItems
            for (const finalState of finalStates) {
                const newHistory = [...finalState.history];
                
                if (hasContent) {
                    // Add the User message (which contains prompt + plugin content)
                    // We can grab it from 'messages' or reconstruct it.
                    // 'userMsgs' contains the constructed user message parts.
                    if (userMsgs.length > 0) {
                         newHistory.push(userMsgs[0]); // Assuming single user message block
                    }
                    newHistory.push(historyMessage);
                } else {
                    // In pass-through, update history to match current state (excluding system)
                    const nonSystemMessages = messages.filter(m => m.role !== 'system');
                    // If pass-through, we might not want to duplicate history if it was just history passed in.
                    // But if we added content (e.g. from plugins) but no prompt, we should record it.
                    // Here hasContent is false, so state.content is empty.
                    // So we just keep history as is?
                    // Actually, if hasContent is false, userMsgs is empty.
                    // So newHistory is just state.history.
                }

                const newItem: PipelineItem = {
                    row: finalState.row,
                    workspace: item.workspace, // Preserve original workspace or update?
                    // The prompt implies 'context' is the working state.
                    // We can update workspace with finalState.context if we want persistence.
                    // But let's stick to 'row' being the output.
                    stepHistory: [...finalState.stepHistory, resultData],
                    history: newHistory,
                    originalIndex: finalState.originalIndex,
                    variationIndex: finalState.variationIndex
                };
                
                nextItems.push(newItem);
            }
        }

        return nextItems;
    }
}
