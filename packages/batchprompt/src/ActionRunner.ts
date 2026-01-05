import path from 'path';
import { RuntimeConfig, StepConfig, PipelineItem, GlobalContext, OutputStrategy, StepContext, StepExecutionContext } from './types.js';
import { StepExecutor } from './StepExecutor.js';
import { PluginRegistryV2, PluginPacket, PluginServices, Plugin } from './plugins/types.js';
import { ResultProcessor } from './core/ResultProcessor.js';
import { StepResolver } from './core/StepResolver.js';
import { MessageBuilder } from './core/MessageBuilder.js';
import { ResolvedPluginBase } from './config/types.js';
import { countChars } from 'llm-fns';

interface TaskPayload {
    item: PipelineItem;
    stepIndex: number;
}

export class ActionRunner {
    constructor(
        private globalContext: GlobalContext,
        private pluginRegistry: PluginRegistryV2,
        private stepResolver: StepResolver,
        private messageBuilder: MessageBuilder
    ) {}

    async run(config: RuntimeConfig) {
        const { concurrency, taskConcurrency, data, steps, offset = 0, limit } = config;
        const events = this.globalContext.events;

        events.emit('run:start', config);
        events.emit('step:progress', { row: -1, step: -1, type: 'info', message: `Initializing with concurrency: ${concurrency} (LLM) / ${taskConcurrency} (Tasks)` });

        this.globalContext.taskQueue.concurrency = taskConcurrency;
        this.globalContext.gptQueue.concurrency = concurrency;

        const endIndex = limit ? offset + limit : undefined;
        const dataToProcess = data.slice(offset, endIndex);

        events.emit('step:progress', { row: -1, step: -1, type: 'info', message: `Processing ${dataToProcess.length} rows.` });

        const queue = this.globalContext.taskQueue;
        const executor = new StepExecutor(this.globalContext.events, this.messageBuilder);

        const pluginServices: PluginServices = {
            puppeteerHelper: this.globalContext.puppeteerHelper,
            puppeteerQueue: this.globalContext.puppeteerQueue,
            fetcher: this.globalContext.fetcher,
            cache: this.globalContext.cache,
            imageSearch: this.globalContext.imageSearch,
            webSearch: this.globalContext.webSearch,
            createLlm: (config) => this.stepResolver.createLlm(config)
        };

        const enqueueNext = (items: PipelineItem[], nextStepIndex: number) => {
            if (nextStepIndex >= steps.length) {
                for (const item of items) {
                    events.emit('row:end', { index: item.originalIndex, result: item.row });
                }
            } else {
                for (const item of items) {
                    queue.add(() => processTask({ item, stepIndex: nextStepIndex }));
                }
            }
        };

        const processTask = async (payload: TaskPayload) => {
            const { item, stepIndex } = payload;
            const stepConfig = steps[stepIndex];
            const stepNum = stepIndex + 1;
            const timeoutMs = stepConfig.timeout * 1000;

            events.emit('step:start', { row: item.originalIndex, step: stepNum });

            try {
                const { resolvedStep, stepContext } = await this.stepResolver.resolve(
                    item,
                    stepConfig,
                    stepIndex,
                    config.tmpDir
                );

                // Execute with Timeout
                let timer: NodeJS.Timeout;
                const timeoutPromise = new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`Step timed out after ${stepConfig.timeout}s`)), timeoutMs);
                });

                const executionPromise = (async () => {
                    return await this.executeModel(
                        [item],
                        resolvedStep,
                        stepContext,
                        stepNum,
                        executor,
                        pluginServices,
                        resolvedStep.resolvedTempDir || config.tmpDir
                    );
                })();

                const nextItems = await Promise.race([executionPromise, timeoutPromise]);
                clearTimeout(timer!);

                events.emit('step:finish', { row: item.originalIndex, step: stepNum, result: nextItems.length });
                enqueueNext(nextItems, stepIndex + 1);

            } catch (err: any) {
                events.emit('row:error', { index: item.originalIndex, error: err });
                events.emit('step:progress', {
                    row: item.originalIndex,
                    step: stepNum,
                    type: 'error',
                    message: `Step ${stepNum} Error: ${err.message}`,
                    data: err
                });
            }
        };

        for (let i = 0; i < dataToProcess.length; i++) {
            const originalIndex = offset + i;
            const initialItem: PipelineItem = {
                row: dataToProcess[i],
                workspace: {},
                stepHistory: [],
                history: [],
                originalIndex: originalIndex,
                accumulatedContent: []
            };
            events.emit('row:start', { index: originalIndex, row: initialItem.row });
            queue.add(() => processTask({ item: initialItem, stepIndex: 0 }));
        }

        await queue.onIdle();
        events.emit('run:end');
    }

    private async executeModel(
        items: PipelineItem[],
        resolvedStep: StepConfig,
        stepContext: StepContext,
        stepNum: number,
        executor: StepExecutor,
        services: PluginServices,
        tempDir: string
    ): Promise<PipelineItem[]> {

        const inheritedModel = {
            model: resolvedStep.modelConfig.model || this.globalContext.defaultModel,
            temperature: resolvedStep.modelConfig.temperature,
            thinkingLevel: resolvedStep.modelConfig.thinkingLevel
        };

        return this.processBatch(
            items,
            async (currentItem) => {
                const modelViewContext = {
                    ...currentItem.row,
                    ...currentItem.workspace,
                    steps: currentItem.stepHistory,
                    index: currentItem.originalIndex
                };

                // Resolve Plugins for this row
                const resolvedPlugins: { instance: Plugin; config: any; def: ResolvedPluginBase }[] = [];
                for (const pluginDef of resolvedStep.plugins) {
                    const plugin = this.pluginRegistry.get(pluginDef.name);
                    if (plugin) {
                        const resolvedConfig = await plugin.resolveConfig(
                            pluginDef.config,
                            modelViewContext,
                            inheritedModel,
                            this.globalContext.contentResolver
                        );
                        
                        // Construct ResolvedPluginBase compatible object
                        const resolvedDef: ResolvedPluginBase = {
                            type: pluginDef.name,
                            id: (pluginDef.config as any).id || `${pluginDef.name}-${Date.now()}`,
                            output: pluginDef.output,
                            rawConfig: pluginDef.config
                        };

                        resolvedPlugins.push({ instance: plugin, config: resolvedConfig, def: resolvedDef });
                    }
                }

                const result = await executor.executeModel(
                    stepContext,
                    modelViewContext,
                    currentItem.originalIndex,
                    stepNum,
                    resolvedStep,
                    currentItem.history,
                    currentItem.accumulatedContent, // Pass accumulated content as initial user prompt parts
                    currentItem.variationIndex,
                    resolvedPlugins,
                    services,
                    tempDir
                );

                // Case 1: Implicit Explosion (Plugin Exploded)
                if (result.explodedResults) {
                     return result.explodedResults.map(subResult => ({
                        data: subResult.raw !== undefined ? subResult.raw : subResult.columnValue,
                        contentParts: [],
                        _historyUpdate: {
                            userPromptParts: resolvedStep.userPromptParts,
                            historyMessage: subResult.historyMessage
                        }
                     }));
                }

                // Case 2: Explicit Explosion (JSON Array)
                if (resolvedStep.output.explode && Array.isArray(result.modelResult)) {
                    return result.modelResult.map((item: any) => ({
                        data: item,
                        contentParts: [],
                        _historyUpdate: {
                            userPromptParts: resolvedStep.userPromptParts,
                            historyMessage: result.historyMessage
                        }
                    }));
                }

                return [{
                    data: result.modelResult,
                    contentParts: [],
                    _historyUpdate: {
                        userPromptParts: resolvedStep.userPromptParts,
                        historyMessage: result.historyMessage
                    }
                } as any];
            },
            resolvedStep.output,
            'modelOutput',
            stepNum,
            (newItem, packet) => {
                const update = (packet as any)._historyUpdate;
                if (!update) return;

                const newHistory = [...newItem.history];
                
                const hasUserPrompt = countChars({ role: 'user', content: update.userPromptParts }) > 0;

                const assistantContent = update.historyMessage.content;
                const hasAssistantResponse =
                    assistantContent !== null &&
                    assistantContent !== undefined &&
                    assistantContent !== '' &&
                    !(Array.isArray(assistantContent) && assistantContent.length === 0);

                if (hasUserPrompt) {
                    newHistory.push({ role: 'user', content: update.userPromptParts });
                }
                
                if (hasAssistantResponse) {
                    newHistory.push(update.historyMessage);
                }

                newItem.history = newHistory;
                newItem.stepHistory = [...newItem.stepHistory, packet.data];
                delete (packet as any)._historyUpdate;
            }
        );
    }

    private async processBatch(
        items: PipelineItem[],
        operation: (item: PipelineItem) => Promise<PluginPacket[]>,
        outputStrategy: OutputStrategy,
        namespace: string,
        stepNum: number,
        postProcess?: (newItem: PipelineItem, sourcePacket: PluginPacket) => void
    ): Promise<PipelineItem[]> {
        const results = await Promise.all(items.map(async (item) => {
            try {
                const packets = await operation(item);
                return { item, packets };
            } catch (e: any) {
                this.globalContext.events.emit('step:progress', {
                    row: item.originalIndex,
                    step: stepNum,
                    type: 'error',
                    message: `Step ${stepNum} ${namespace} Failed: ${e.message}`,
                    data: e
                });
                return null;
            }
        }));

        const validResults = results.filter(r => r !== null) as { item: PipelineItem, packets: PluginPacket[] }[];
        const nextItems: PipelineItem[] = [];

        for (const res of validResults) {
            // If we have multiple packets (implicit explosion), we force explode behavior in ResultProcessor
            // by temporarily overriding the strategy if it wasn't already set to explode.
            // However, ResultProcessor.process handles explode=false by merging all packets into one item.
            // We want multiple items if packets > 1.
            
            let effectiveStrategy = outputStrategy;
            if (res.packets.length > 1 && !outputStrategy.explode) {
                // Force explode if we have multiple packets (e.g. from plugin explosion)
                effectiveStrategy = { ...outputStrategy, explode: true };
            }

            const processed = ResultProcessor.process(
                [res.item],
                res.packets,
                effectiveStrategy,
                namespace
            );

            if (effectiveStrategy.explode) {
                const totalAvailable = res.packets.length;
                const finalCount = processed.length;

                if (totalAvailable > 1 || finalCount !== totalAvailable) {
                    this.globalContext.events.emit('step:progress', {
                        row: res.item.originalIndex,
                        step: stepNum,
                        type: 'explode',
                        message: '',
                        data: {
                            count: finalCount,
                            source: namespace,
                            total: totalAvailable,
                            limit: effectiveStrategy.limit,
                            offset: effectiveStrategy.offset
                        }
                    });
                }
            }

            if (postProcess) {
                if (effectiveStrategy.explode) {
                    processed.forEach((newItem, idx) => {
                        postProcess(newItem, res.packets[idx]);
                    });
                } else {
                    if (processed.length > 0 && res.packets.length > 0) {
                        postProcess(processed[0], res.packets[0]);
                    }
                }
            }

            nextItems.push(...processed);
        }

        return nextItems;
    }
}
