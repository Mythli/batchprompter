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
            // Check if we should run the model.
            // We only run the model if there is an explicit prompt (user or system) defined in the config.
            // Merely having content from plugins (state.content) is not enough to trigger generation 
            // if the user didn't ask for it.
            const hasExplicitPrompt = 
                resolvedStep.userPromptParts.length > 0 || 
                (resolvedStep.modelConfig.systemParts && resolvedStep.modelConfig.systemParts.length > 0);
            
            if (hasExplicitPrompt) {
                // --- EXECUTE MODEL ---

                // Re-construct view context for message building (system prompt rendering)
                const viewContext = {
                    ...state.context,
                    steps: state.stepHistory,
                    index: state.originalIndex
                };

                // Build Messages
                // We pass empty promptParts to MessageBuilder because we manually handle the user message construction
                // from state.content below. This avoids duplicating the prompt if it was already in state.content.
                const configForMessageBuilder = {
                    ...resolvedStep.modelConfig,
                    promptParts: [] 
                };

                const currentMessages = this.messageBuilder.build(configForMessageBuilder, viewContext, state.content);
                
                // Inject History
                const systemMsg = currentMessages.find(m => m.role === 'system');
                const userMsgs = currentMessages.filter(m => m.role !== 'system');
                
                const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
                if (systemMsg) messages.push(systemMsg);
                messages.push(...state.history);
                messages.push(...userMsgs);

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
                
                const resultData = result.modelResult;
                const historyMessage = result.historyMessage;
                
                let explodedResults: any[] | undefined;
                if (result.explodedResults) {
                    explodedResults = result.explodedResults.map(r => r.raw !== undefined ? r.raw : r.columnValue);
                }

                // Process Results (Explosion & Output)
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
                    
                    // Add the User message (which contains prompt + plugin content)
                    if (userMsgs.length > 0) {
                         newHistory.push(userMsgs[0]); // Assuming single user message block
                    }
                    newHistory.push(historyMessage);

                    const newItem: PipelineItem = {
                        row: finalState.row,
                        workspace: item.workspace,
                        stepHistory: [...finalState.stepHistory, resultData],
                        history: newHistory,
                        originalIndex: finalState.originalIndex,
                        variationIndex: finalState.variationIndex
                    };
                    
                    nextItems.push(newItem);
                }

            } else {
                // --- PASS-THROUGH MODE ---
                // Plugins have already executed and modified 'state.row' via ResultProcessor in PluginExecutor.
                // We just pass the state forward.
                
                events.emit('step:progress', { row: state.originalIndex, step: stepNum, type: 'info', message: 'No prompt provided. Skipping model execution.' });

                const newItem: PipelineItem = {
                    row: state.row,
                    workspace: item.workspace,
                    stepHistory: [...state.stepHistory], // No new step history for pass-through? Or should we record null?
                    history: state.history, // Keep history as-is (don't inject plugin content without a response)
                    originalIndex: state.originalIndex,
                    variationIndex: state.variationIndex
                };
                
                nextItems.push(newItem);
            }
        }

        return nextItems;
    }
}
