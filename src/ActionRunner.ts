import fsPromises from 'fs/promises';
import path from 'path';
import { Parser, transforms } from 'json2csv';
import PQueue from 'p-queue';
import Handlebars from 'handlebars';
import { RuntimeConfig, StepConfig, PipelineItem, GlobalContext } from './types.js';
import { StepExecutor } from './StepExecutor.js';
import { PromptResolver } from './utils/PromptResolver.js';
import { SchemaHelper } from './utils/SchemaHelper.js';
import { aggressiveSanitize, ensureDir } from './utils/fileUtils.js';
import { PluginRegistryV2, PluginPacket, PluginServices } from './plugins/types.js';
import { ResultProcessor } from './core/ResultProcessor.js';
import { PromptPreprocessorRegistry } from './preprocessors/PromptPreprocessorRegistry.js';
import { StepContextFactory } from './core/StepContextFactory.js';
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
        private stepContextFactory: StepContextFactory,
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

        const queue = new PQueue({ concurrency: taskConcurrency });

        const executor = new StepExecutor(tmpDir, this.messageBuilder);

        const finalResults: Record<string, any>[] = [];

        // Build plugin services
        const pluginServices: PluginServices = {
            puppeteerHelper: this.globalContext.puppeteerHelper,
            puppeteerQueue: this.globalContext.puppeteerQueue,
            fetcher: this.globalContext.fetcher,
            cache: this.globalContext.cache,
            imageSearch: this.globalContext.imageSearch,
            webSearch: this.globalContext.webSearch,
            createLlm: (config) => this.stepContextFactory['llmFactory'].create(config)
        };

        const processTask = async (payload: TaskPayload) => {
            const { item, stepIndex } = payload;
            const stepConfig = steps[stepIndex];
            const stepNum = stepIndex + 1;

            // Use the prepared timeout from the step config
            const timeoutMs = stepConfig.timeout * 1000;

            try {
                const viewContext = {
                    ...item.row,
                    ...item.workspace,
                    steps: item.stepHistory,
                    index: item.originalIndex
                };

                const sanitizedRow: Record<string, any> = {};
                for (const [key, val] of Object.entries(viewContext)) {
                     const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
                     sanitizedRow[key] = aggressiveSanitize(stringVal);
                }

                const resolvedStep = await this.prepareStepConfig(
                    stepConfig,
                    viewContext,
                    sanitizedRow,
                    item.originalIndex,
                    stepNum,
                    tmpDir
                );

                const stepContext = this.stepContextFactory.create(resolvedStep);

                console.log(`[Row ${item.originalIndex}] Step ${stepNum} Processing...`);

                // Active items tracking for this step
                let activeItems: PipelineItem[] = [item];
                const nextItemsForQueue: PipelineItem[] = [];

                // Wrap execution in timeout
                let timer: NodeJS.Timeout;
                const timeoutPromise = new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`Step timed out after ${stepConfig.timeout}s`)), timeoutMs);
                });

                const executionPromise = (async () => {
                    // Get inherited model settings for plugins
                    const inheritedModel = {
                        model: resolvedStep.modelConfig.model || this.globalContext.defaultModel,
                        temperature: resolvedStep.modelConfig.temperature,
                        thinkingLevel: resolvedStep.modelConfig.thinkingLevel
                    };

                    // Execute plugins
                    for (let pluginIdx = 0; pluginIdx < resolvedStep.plugins.length; pluginIdx++) {
                        const pluginDef = resolvedStep.plugins[pluginIdx];
                        const nextItems: PipelineItem[] = [];

                        const plugin = this.pluginRegistry.get(pluginDef.name);
                        if (!plugin) {
                            console.warn(`[Row ${item.originalIndex}] Step ${stepNum} Plugin '${pluginDef.name}' not found, skipping.`);
                            nextItems.push(...activeItems);
                            continue;
                        }

                        // Parallelize plugin execution for all active items
                        // Use a local queue to respect task concurrency limits within this step explosion
                        const pluginQueue = new PQueue({ concurrency: taskConcurrency });

                        await Promise.all(activeItems.map(currentItem => pluginQueue.add(async () => {
                            try {
                                const pluginViewContext = {
                                    ...currentItem.row,
                                    ...currentItem.workspace,
                                    steps: currentItem.stepHistory,
                                    index: currentItem.originalIndex
                                };

                                // Resolve plugin config with row context
                                const resolvedPluginConfig = await plugin.resolveConfig(
                                    pluginDef.config,
                                    pluginViewContext,
                                    inheritedModel
                                );

                                // Execute plugin
                                const result = await plugin.execute(resolvedPluginConfig, {
                                    row: pluginViewContext,
                                    stepIndex: stepNum,
                                    pluginIndex: pluginIdx,
                                    services: pluginServices,
                                    tempDirectory: resolvedStep.resolvedTempDir || tmpDir,
                                    outputDirectory: resolvedStep.resolvedOutputDir,
                                    outputBasename: resolvedStep.outputBasename,
                                    outputExtension: resolvedStep.outputExtension
                                });

                                const processedItems = ResultProcessor.process(
                                    [currentItem],
                                    result.packets,
                                    pluginDef.output,
                                    toCamel(pluginDef.name)
                                );

                                nextItems.push(...processedItems);

                            } catch (pluginError: any) {
                                console.error(`[Row ${item.originalIndex}] Step ${stepNum} Plugin '${pluginDef.name}' Failed:`, pluginError);
                                rowErrors.push({ index: item.originalIndex, error: pluginError });
                            }
                        })));

                        activeItems = nextItems;
                    }

                    // Parallelize Model Execution
                    const modelQueue = new PQueue({ concurrency: taskConcurrency });

                    await Promise.all(activeItems.map(currentItem => modelQueue.add(async () => {
                        try {
                            const modelViewContext = {
                                ...currentItem.row,
                                ...currentItem.workspace,
                                ...currentItem.workspace,
                                steps: currentItem.stepHistory,
                                index: currentItem.originalIndex
                            };

                            // Combine accumulated content from plugins with user prompt parts
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

                            // Wrap model result in a packet for uniform processing
                            const modelPacket: PluginPacket = {
                                data: result.modelResult,
                                contentParts: []
                            };

                            const processedItems = ResultProcessor.process(
                                [currentItem],
                                [modelPacket],
                                resolvedStep.output,
                                'modelOutput'
                            );

                            for (const finalItem of processedItems) {
                                const newHistory = [...finalItem.history];

                                const hasUserPrompt = resolvedStep.userPromptParts.length > 0 && resolvedStep.userPromptParts.some(p => {
                                    if (p.type === 'text') return p.text.trim().length > 0;
                                    return true;
                                });

                                const assistantContent = result.historyMessage.content;
                                const hasAssistantResponse =
                                    assistantContent !== null &&
                                    assistantContent !== undefined &&
                                    assistantContent !== '' &&
                                    !(Array.isArray(assistantContent) && assistantContent.length === 0);

                                if (hasUserPrompt) {
                                    newHistory.push({ role: 'user', content: resolvedStep.userPromptParts });

                                    if (hasAssistantResponse) {
                                        newHistory.push(result.historyMessage);
                                    }
                                }

                                finalItem.history = newHistory;
                                finalItem.stepHistory = [...finalItem.stepHistory, result.modelResult];

                                nextItemsForQueue.push(finalItem);
                            }
                        } catch (modelError: any) {
                            console.error(`[Row ${item.originalIndex}] Step ${stepNum} Model Execution Failed:`, modelError.message);
                            rowErrors.push({ index: item.originalIndex, error: modelError });
                        }
                    })));
                })();

                try {
                    await Promise.race([executionPromise, timeoutPromise]);
                } finally {
                    clearTimeout(timer!);
                }

                if (stepIndex === steps.length - 1) {
                    finalResults.push(...nextItemsForQueue.map(i => i.row));
                } else {
                    for (const nextItem of nextItemsForQueue) {
                        queue.add(() => processTask({
                            item: nextItem,
                            stepIndex: stepIndex + 1
                        }));
                    }
                }

            } catch (err: any) {
                console.error(`[Row ${item.originalIndex}] Step ${stepNum} Error:`, err.message || err);
                rowErrors.push({ index: item.originalIndex, error: err });
            }
        };

        try {
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

                queue.add(() => processTask({
                    item: initialItem,
                    stepIndex: 0
                }));
            }

            await queue.onIdle();
            console.log("All tasks completed.");

            if (rowErrors.length > 0) {
                console.error(`\n⚠️  Completed with ${rowErrors.length} errors.`);
            } else {
                console.log(`\n✅ Successfully processed all tasks.\n`);
            }

        } finally {
            let finalOutputPath: string;
            let isJson = false;

            if (dataOutputPath) {
                finalOutputPath = dataOutputPath;
                isJson = dataOutputPath.toLowerCase().endsWith('.json');
            } else {
                // Default to output.csv in current directory
                finalOutputPath = path.join(process.cwd(), 'output.csv');
            }

            const validResults = finalResults.filter(r => r !== undefined && r !== null);

            if (validResults.length === 0) {
                console.warn("No results to save.");
                return;
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

    private async prepareStepConfig(
        stepConfig: StepConfig,
        viewContext: Record<string, any>,
        sanitizedRow: Record<string, any>,
        rowIndex: number,
        stepIndex: number,
        globalTmpDir: string
    ): Promise<StepConfig> {
        const resolvedStep: StepConfig = { ...stepConfig };

        if (stepConfig.outputTemplate) {
            const delegate = Handlebars.compile(stepConfig.outputTemplate, { noEscape: true });
            resolvedStep.outputPath = delegate(sanitizedRow);

            resolvedStep.resolvedOutputDir = path.dirname(resolvedStep.outputPath);
            await ensureDir(resolvedStep.resolvedOutputDir);

            const parsed = path.parse(resolvedStep.outputPath);
            resolvedStep.outputBasename = parsed.name;
            resolvedStep.outputExtension = parsed.ext;
        } else {
            resolvedStep.outputBasename = `output_${rowIndex}_${stepIndex}`;
            resolvedStep.outputExtension = stepConfig.aspectRatio ? '.png' : '.txt';
        }

        // Resolve globalTmpDir template
        const tmpDirDelegate = Handlebars.compile(globalTmpDir, { noEscape: true });
        const resolvedGlobalTmpDir = tmpDirDelegate(sanitizedRow);

        if (resolvedStep.resolvedOutputDir) {
            resolvedStep.resolvedTempDir = path.join(resolvedGlobalTmpDir, resolvedStep.resolvedOutputDir);
        } else {
            const rowStr = String(rowIndex).padStart(3, '0');
            const stepStr = String(stepIndex).padStart(2, '0');
            resolvedStep.resolvedTempDir = path.join(resolvedGlobalTmpDir, `${rowStr}_${stepStr}`);
        }
        await ensureDir(resolvedStep.resolvedTempDir);

        if (stepConfig.schemaPath) {
            try {
                resolvedStep.jsonSchema = await SchemaHelper.loadAndRenderSchema(stepConfig.schemaPath, sanitizedRow);
            } catch (e) {
                console.warn(`[Row ${rowIndex}] Failed to load/parse schema from '${stepConfig.schemaPath}':`, e);
            }
        }

        if (stepConfig.userPromptParts.length === 1 && stepConfig.userPromptParts[0].type === 'text' && stepConfig.userPromptParts[0].text.includes('{{')) {
            const template = stepConfig.userPromptParts[0].text;
            resolvedStep.userPromptParts = await PromptResolver.resolve(template, viewContext);
        }

        resolvedStep.plugins = stepConfig.plugins;

        return resolvedStep;
    }
}

const toCamel = (s: string) => {
    return s.replace(/-([a-z0-9])/g, (g) => g[1].toUpperCase());
};
