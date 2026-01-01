import path from 'path';
import { RuntimeConfig, StepConfig, PipelineItem, GlobalContext, OutputStrategy, StepContext, StepExecutionContext } from './types.js';
import { StepExecutor } from './StepExecutor.js';
import { PluginRegistryV2, PluginPacket, PluginServices } from './plugins/types.js';
import { ResultProcessor } from './core/ResultProcessor.js';
import { PromptPreprocessorRegistry } from './preprocessors/PromptPreprocessorRegistry.js';
import { StepResolver } from './core/StepResolver.js';
import { MessageBuilder } from './core/MessageBuilder.js';

interface TaskPayload {
    item: PipelineItem;
    stepIndex: number;
}

export class ActionRunner {
    constructor(
        private globalContext: GlobalContext,
        private pluginRegistry: PluginRegistryV2,
        private preprocessorRegistry: PromptPreprocessorRegistry,
        private stepResolver: StepResolver,
        private messageBuilder: MessageBuilder
    ) {}

    async run(config: RuntimeConfig) {
        const { concurrency, taskConcurrency, data, steps, offset = 0, limit } = config;
        const events = this.globalContext.events;

        events.emit('run:start', config);
        events.emit('log', { level: 'info', message: `Initializing with concurrency: ${concurrency} (LLM) / ${taskConcurrency} (Tasks)` });

        this.globalContext.taskQueue.concurrency = taskConcurrency;
        this.globalContext.gptQueue.concurrency = concurrency;

        const endIndex = limit ? offset + limit : undefined;
        const dataToProcess = data.slice(offset, endIndex);

        events.emit('log', { level: 'info', message: `Processing ${dataToProcess.length} rows.` });

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

                // 1. Prepare Handler
                if (resolvedStep.handlers?.prepare) {
                    const execContext: StepExecutionContext = {
                        row: item.row,
                        workspace: item.workspace,
                        stepIndex: stepIndex,
                        rowIndex: item.originalIndex,
                        history: item.history
                    };
                    await resolvedStep.handlers.prepare(execContext);
                }

                // 2. Execute with Timeout
                let activeItems: PipelineItem[] = [item];

                let timer: NodeJS.Timeout;
                const timeoutPromise = new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`Step timed out after ${stepConfig.timeout}s`)), timeoutMs);
                });

                const executionPromise = (async () => {
                    // A. Plugins
                    activeItems = await this.executePlugins(
                        activeItems,
                        resolvedStep,
                        stepNum,
                        pluginServices,
                        resolvedStep.resolvedTempDir || config.tmpDir
                    );

                    // B. Model
                    return await this.executeModel(
                        activeItems,
                        resolvedStep,
                        stepContext,
                        stepNum,
                        executor
                    );
                })();

                const nextItems = await Promise.race([executionPromise, timeoutPromise]);
                clearTimeout(timer!);

                // 3. Process Handler (Post-processing)
                if (resolvedStep.handlers?.process) {
                    for (const nextItem of nextItems) {
                        // We assume the last entry in stepHistory is the result of this step
                        const result = nextItem.stepHistory[nextItem.stepHistory.length - 1];
                        const execContext: StepExecutionContext = {
                            row: nextItem.row,
                            workspace: nextItem.workspace,
                            stepIndex: stepIndex,
                            rowIndex: nextItem.originalIndex,
                            history: nextItem.history
                        };
                        await resolvedStep.handlers.process(execContext, result);
                    }
                }

                events.emit('step:finish', { row: item.originalIndex, step: stepNum, result: nextItems.length });
                enqueueNext(nextItems, stepIndex + 1);

            } catch (err: any) {
                events.emit('row:error', { index: item.originalIndex, error: err });
                events.emit('log', { level: 'error', message: `[Row ${item.originalIndex}] Step ${stepNum} Error: ${err.message}` });
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

    private async executePlugins(
        items: PipelineItem[],
        resolvedStep: StepConfig,
        stepNum: number,
        services: PluginServices,
        tempDir: string
    ): Promise<PipelineItem[]> {
        let activeItems = items;
        const inheritedModel = {
            model: resolvedStep.modelConfig.model || this.globalContext.defaultModel,
            temperature: resolvedStep.modelConfig.temperature,
            thinkingLevel: resolvedStep.modelConfig.thinkingLevel
        };

        for (let pluginIdx = 0; pluginIdx < resolvedStep.plugins.length; pluginIdx++) {
            const pluginDef = resolvedStep.plugins[pluginIdx];
            const plugin = this.pluginRegistry.get(pluginDef.name);

            if (!plugin) continue;

            activeItems = await this.processBatch(
                activeItems,
                async (currentItem) => {
                    const pluginViewContext = {
                        ...currentItem.row,
                        ...currentItem.workspace,
                        steps: currentItem.stepHistory,
                        index: currentItem.originalIndex
                    };

                    const resolvedPluginConfig = await plugin.resolveConfig(
                        pluginDef.config,
                        pluginViewContext,
                        inheritedModel
                    );

                    const result = await plugin.execute(resolvedPluginConfig, {
                        row: pluginViewContext,
                        stepIndex: stepNum,
                        pluginIndex: pluginIdx,
                        services: services,
                        tempDirectory: tempDir,
                        // Pass emitter to plugin context
                        emit: (event, ...args) => {
                            if (event === 'artifact') {
                                const payload = args[0];
                                if (payload && payload.filename && !path.isAbsolute(payload.filename) && !payload.filename.startsWith('out')) {
                                    payload.filename = path.join(tempDir, payload.filename);
                                }
                                this.globalContext.events.emit('artifact', payload);
                            } else {
                                this.globalContext.events.emit(event, ...args);
                            }
                        }
                    });

                    return result.packets;
                },
                pluginDef.output,
                toCamel(pluginDef.name),
                stepNum
            );
        }

        return activeItems;
    }

    private async executeModel(
        items: PipelineItem[],
        resolvedStep: StepConfig,
        stepContext: StepContext,
        stepNum: number,
        executor: StepExecutor
    ): Promise<PipelineItem[]> {

        return this.processBatch(
            items,
            async (currentItem) => {
                const modelViewContext = {
                    ...currentItem.row,
                    ...currentItem.workspace,
                    steps: currentItem.stepHistory,
                    index: currentItem.originalIndex
                };

                let effectiveParts = [...currentItem.accumulatedContent, ...resolvedStep.userPromptParts];

                for (const ppDef of resolvedStep.preprocessors) {
                    const preprocessor = this.preprocessorRegistry.get(ppDef.name);
                    if (preprocessor) {
                        effectiveParts = await preprocessor.process(effectiveParts, {
                            row: modelViewContext,
                            services: {
                                puppeteerHelper: this.globalContext.puppeteerHelper,
                                fetcher: this.globalContext.fetcher,
                                puppeteerQueue: this.globalContext.puppeteerQueue
                            }
                        }, ppDef.config);
                    }
                }

                const result = await executor.executeModel(
                    stepContext,
                    modelViewContext,
                    currentItem.originalIndex,
                    stepNum,
                    resolvedStep,
                    currentItem.history,
                    effectiveParts,
                    currentItem.variationIndex
                );

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
                const hasUserPrompt = update.userPromptParts.length > 0 && update.userPromptParts.some((p: any) => {
                    if (p.type === 'text') return p.text.trim().length > 0;
                    return true;
                });

                const assistantContent = update.historyMessage.content;
                const hasAssistantResponse =
                    assistantContent !== null &&
                    assistantContent !== undefined &&
                    assistantContent !== '' &&
                    !(Array.isArray(assistantContent) && assistantContent.length === 0);

                if (hasUserPrompt) {
                    newHistory.push({ role: 'user', content: update.userPromptParts });
                    if (hasAssistantResponse) {
                        newHistory.push(update.historyMessage);
                    }
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
                this.globalContext.events.emit('log', { level: 'error', message: `[Row ${item.originalIndex}] Step ${stepNum} ${namespace} Failed: ${e.message}` });
                return null;
            }
        }));

        const validResults = results.filter(r => r !== null) as { item: PipelineItem, packets: PluginPacket[] }[];
        const nextItems: PipelineItem[] = [];

        for (const res of validResults) {
            const processed = ResultProcessor.process(
                [res.item],
                res.packets,
                outputStrategy,
                namespace
            );

            if (postProcess) {
                if (outputStrategy.explode) {
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

const toCamel = (s: string) => {
    return s.replace(/-([a-z0-9])/g, (g) => g[1].toUpperCase());
};
