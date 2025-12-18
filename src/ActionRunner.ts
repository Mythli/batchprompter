import fsPromises from 'fs/promises';
import path from 'path';
import { Parser, transforms } from 'json2csv';
import PQueue from 'p-queue';
import { RuntimeConfig, StepConfig, PipelineItem, GlobalContext, OutputStrategy, StepContext } from './types.js';
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
        const { concurrency, taskConcurrency, data, steps, dataOutputPath, tmpDir, offset = 0, limit } = config;

        console.log(`Initializing with concurrency: ${concurrency} (LLM) / ${taskConcurrency} (Tasks)`);

        const endIndex = limit ? offset + limit : undefined;
        const dataToProcess = data.slice(offset, endIndex);

        console.log(`Found ${data.length} rows in input.`);
        if (offset > 0 || limit) {
            console.log(`Processing subset: Rows ${offset} to ${endIndex ? endIndex - 1 : data.length - 1} (${dataToProcess.length} total).`);
        } else {
            console.log(`Processing all ${data.length} rows.`);
        }

        console.log(`Pipeline has ${steps.length} steps.`);

        const rowErrors: { index: number, error: any }[] = [];
        const finalResults: Record<string, any>[] = [];

        // Task queue limits how many rows are processed in parallel
        const queue = new PQueue({ concurrency: taskConcurrency });
        const executor = new StepExecutor(tmpDir, this.messageBuilder);

        // Build plugin services once
        const pluginServices: PluginServices = {
            puppeteerHelper: this.globalContext.puppeteerHelper,
            puppeteerQueue: this.globalContext.puppeteerQueue,
            fetcher: this.globalContext.fetcher,
            cache: this.globalContext.cache,
            imageSearch: this.globalContext.imageSearch,
            webSearch: this.globalContext.webSearch,
            createLlm: (config) => this.stepResolver.createLlm(config)
        };

        // Helper to enqueue next steps or collect results
        const enqueueNext = (items: PipelineItem[], nextStepIndex: number) => {
            if (nextStepIndex >= steps.length) {
                finalResults.push(...items.map(i => i.row));
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

            try {
                // 1. Resolve Step & Context
                const { resolvedStep, stepContext } = await this.stepResolver.resolve(
                    item,
                    stepConfig,
                    stepIndex,
                    tmpDir
                );

                console.log(`[Row ${item.originalIndex}] Step ${stepNum} Processing...`);

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
                        resolvedStep.resolvedTempDir || tmpDir
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

                // 3. Queue Next Steps
                enqueueNext(nextItems, stepIndex + 1);

            } catch (err: any) {
                console.error(`[Row ${item.originalIndex}] Step ${stepNum} Error:`, err.message || err);
                rowErrors.push({ index: item.originalIndex, error: err });
            }
        };

        // Initial Queueing
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

            queue.add(() => processTask({ item: initialItem, stepIndex: 0 }));
        }

        await queue.onIdle();
        console.log("All tasks completed.");

        if (rowErrors.length > 0) {
            console.error(`\n⚠️  Completed with ${rowErrors.length} errors.`);
        } else {
            console.log(`\n✅ Successfully processed all tasks.\n`);
        }

        await this.saveResults(finalResults, dataOutputPath);
    }

    /**
     * Executes all configured plugins for the step.
     */
    private async executePlugins(
        items: PipelineItem[],
        resolvedStep: StepConfig,
        stepNum: number,
        services: PluginServices,
        tempDir: string
    ): Promise<PipelineItem[]> {
        let activeItems = items;

        // Inherited model settings for plugins
        const inheritedModel = {
            model: resolvedStep.modelConfig.model || this.globalContext.defaultModel,
            temperature: resolvedStep.modelConfig.temperature,
            thinkingLevel: resolvedStep.modelConfig.thinkingLevel
        };

        for (let pluginIdx = 0; pluginIdx < resolvedStep.plugins.length; pluginIdx++) {
            const pluginDef = resolvedStep.plugins[pluginIdx];
            const plugin = this.pluginRegistry.get(pluginDef.name);

            if (!plugin) {
                console.warn(`Step ${stepNum} Plugin '${pluginDef.name}' not found, skipping.`);
                continue;
            }

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
                        outputDirectory: resolvedStep.resolvedOutputDir,
                        outputBasename: resolvedStep.outputBasename,
                        outputExtension: resolvedStep.outputExtension
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

    /**
     * Executes the main model generation for the step.
     */
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

                // 1. Preprocessing
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

                // 2. Execution
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
                    // Attach metadata for history update
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
                // Custom post-processing for Model Execution to update history
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
                
                // Clean up internal metadata
                delete (packet as any)._historyUpdate;
            }
        );
    }

    /**
     * Generic helper to run an operation on items in parallel and process results.
     */
    private async processBatch(
        items: PipelineItem[],
        operation: (item: PipelineItem) => Promise<PluginPacket[]>,
        outputStrategy: OutputStrategy,
        namespace: string,
        stepNum: number,
        postProcess?: (newItem: PipelineItem, sourcePacket: PluginPacket) => void
    ): Promise<PipelineItem[]> {
        // Run operations in parallel (concurrency limited by global queues)
        const results = await Promise.all(items.map(async (item) => {
            try {
                const packets = await operation(item);
                return { item, packets };
            } catch (e: any) {
                console.error(`[Row ${item.originalIndex}] Step ${stepNum} ${namespace} Failed:`, e.message);
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

    private async saveResults(results: Record<string, any>[], outputPath?: string) {
        const validResults = results.filter(r => r !== undefined && r !== null);

        if (validResults.length === 0) {
            console.warn("No results to save.");
            return;
        }

        let finalOutputPath: string;
        let isJson = false;

        if (outputPath) {
            finalOutputPath = outputPath;
            isJson = outputPath.toLowerCase().endsWith('.json');
        } else {
            finalOutputPath = path.join(process.cwd(), 'output.csv');
        }

        if (isJson) {
            await fsPromises.writeFile(finalOutputPath, JSON.stringify(validResults, null, 2));
        } else {
            try {
                const parser = new Parser({
                    transforms: [
                        transforms.flatten({ separator: '.', objects: true, arrays: false })
                    ]
                });
                const csv = parser.parse(validResults);
                await fsPromises.writeFile(finalOutputPath, csv);
            } catch (e) {
                console.error("Failed to write CSV output.", e);
            }
        }
        console.log(`Updated data saved to ${finalOutputPath}`);
    }
}

const toCamel = (s: string) => {
    return s.replace(/-([a-z0-9])/g, (g) => g[1].toUpperCase());
};
