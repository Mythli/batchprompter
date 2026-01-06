import OpenAI from 'openai';
import { StepResolver } from './StepResolver.js';
import { PluginExecutor, ResolvedPlugin } from './PluginExecutor.js';
import { StepExecutor } from '../StepExecutor.js';
import { MessageBuilder } from './MessageBuilder.js';
import { PluginRegistryV2, PluginServices } from '../plugins/types.js';
import { GlobalContext, PipelineItem, StepExecutionState } from '../types.js';
import { ResultProcessor } from './ResultProcessor.js';
import { ResolvedPluginBase } from '../config/types.js';

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
            const plugin = this.pluginRegistry.get(pluginDef.type);
            if (plugin) {
                const inheritedModel = {
                    model: resolvedStep.model.model || this.globalContext.defaultModel,
                    temperature: resolvedStep.model.temperature,
                    thinkingLevel: resolvedStep.model.thinkingLevel
                };

                // Plugins might have rawConfig wrapper or be direct objects depending on how they were loaded
                const rawPluginConfig = (pluginDef as any).rawConfig || pluginDef;

                const resolvedConfig = await plugin.resolveConfig(
                    rawPluginConfig,
                    initialViewContext,
                    inheritedModel,
                    this.globalContext.contentResolver
                );
                
                const resolvedDef: ResolvedPluginBase = {
                    type: pluginDef.type,
                    id: (pluginDef as any).id || `${pluginDef.type}-${Date.now()}`,
                    output: pluginDef.output,
                    rawConfig: rawPluginConfig
                };

                resolvedPlugins.push({ instance: plugin, config: resolvedConfig, def: resolvedDef });
            }
        }

        // 3. Initialize StepExecutionState
        // We start with the resolved user prompt in 'content'
        const initialState: StepExecutionState = {
            history: item.history,
            content: [...(resolvedStep.userPromptParts || [])],
            context: { ...item.row, ...item.workspace },
            row: { ...item.row },
            originalIndex: item.originalIndex,
            variationIndex: item.variationIndex,
            stepHistory: item.stepHistory
        };

        // 4. Run Plugins
        const processedStates = await this.pluginExecutor.runPreparationPhase(
            [initialState],
            resolvedPlugins,
            stepIndex
        );

        // 5. Execute Model
        const nextItems: PipelineItem[] = [];

        for (const state of processedStates) {
            // Check if we should run the model.
            // We run if there is an explicit prompt (user or system)
            const hasExplicitPrompt = 
                (resolvedStep.userPromptParts && resolvedStep.userPromptParts.length > 0) || 
                (resolvedStep.model.system && (Array.isArray(resolvedStep.model.system) ? resolvedStep.model.system.length > 0 : true));
            
            if (hasExplicitPrompt) {
                // --- EXECUTE MODEL ---
                const viewContext = {
                    ...state.context,
                    steps: state.stepHistory,
                    index: state.originalIndex
                };

                // Build Messages
                // We pass empty promptParts to MessageBuilder because we manually handle the user message construction
                // from state.content below.
                const configForMessageBuilder = {
                    model: resolvedStep.model.model,
                    temperature: resolvedStep.model.temperature,
                    thinkingLevel: resolvedStep.model.thinkingLevel,
                    systemParts: stepContext.llm.getSystemParts(), // Already resolved in StepResolver
                    promptParts: [] 
                };

                const currentMessages = this.messageBuilder.build(configForMessageBuilder, viewContext, state.content);
                
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
                    state.context
                );
                
                const resultData = result.modelResult;
                const historyMessage = result.historyMessage;
                
                let explodedResults: any[] | undefined;
                if (result.explodedResults) {
                    explodedResults = result.explodedResults.map(r => r.raw !== undefined ? r.raw : r.columnValue);
                }

                // Process Results
                let itemsToProcess: any[] = [];
                
                if (explodedResults) {
                    itemsToProcess = explodedResults;
                } else if (resolvedStep.output.explode && Array.isArray(resultData)) {
                    itemsToProcess = resultData;
                } else {
                    itemsToProcess = [resultData];
                }

                const packets = itemsToProcess.map(data => ({
                    data,
                    contentParts: [],
                }));

                const finalStates = ResultProcessor.process(
                    [state],
                    packets,
                    resolvedStep.output,
                    'modelOutput'
                );

                for (const finalState of finalStates) {
                    const newHistory = [...finalState.history];
                    if (userMsgs.length > 0) {
                         newHistory.push(userMsgs[0]);
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
                events.emit('step:progress', { row: state.originalIndex, step: stepNum, type: 'info', message: 'No prompt provided. Skipping model execution.' });

                const newItem: PipelineItem = {
                    row: state.row,
                    workspace: item.workspace,
                    stepHistory: [...state.stepHistory],
                    history: state.history,
                    originalIndex: state.originalIndex,
                    variationIndex: state.variationIndex
                };
                
                nextItems.push(newItem);
            }
        }

        return nextItems;
    }
}
