import fsPromises from 'fs/promises';
import path from 'path';
import { Parser, transforms } from 'json2csv';
import PQueue from 'p-queue';
import Handlebars from 'handlebars';
import { LlmClient } from 'llm-fns';
import { RuntimeConfig, StepConfig, PipelineItem } from './types.js';
import { StepExecutor } from './StepExecutor.js';
import { PromptResolver } from './utils/PromptResolver.js';
import { SchemaHelper } from './utils/SchemaHelper.js';
import { aggressiveSanitize, ensureDir } from './utils/fileUtils.js';
import { PluginServices } from './plugins/types.js';
import { PluginRegistry } from './plugins/PluginRegistry.js';
import { PluginRunner } from './core/PluginRunner.js';
import { ResultProcessor } from './core/ResultProcessor.js';
import OpenAI from 'openai';
import { PromptPreprocessorRegistry } from './preprocessors/PromptPreprocessorRegistry.js';

interface TaskPayload {
    item: PipelineItem;
    stepIndex: number;
}

export class ActionRunner {
    constructor(
        private llm: LlmClient,
        private services: PluginServices,
        private pluginRegistry: PluginRegistry,
        private preprocessorRegistry: PromptPreprocessorRegistry
    ) {}

    async run(config: RuntimeConfig) {
        const { concurrency, taskConcurrency, data, steps, dataFilePath, dataOutputPath, tmpDir, offset = 0, limit } = config;

        console.log(`Initializing with concurrency: ${concurrency} (LLM) / ${taskConcurrency} (Tasks)`);
        
        // Slicing Logic
        const endIndex = limit ? offset + limit : undefined;
        const dataToProcess = data.slice(offset, endIndex);
        
        console.log(`Found ${data.length} rows in file.`);
        if (offset > 0 || limit) {
            console.log(`Processing subset: Rows ${offset} to ${endIndex ? endIndex - 1 : data.length - 1} (${dataToProcess.length} total).`);
        } else {
            console.log(`Processing all ${data.length} rows.`);
        }
        
        console.log(`Pipeline has ${steps.length} steps.`);

        const rowErrors: { index: number, error: any }[] = [];
        
        // Initialize Task Queue
        const queue = new PQueue({ concurrency: taskConcurrency });

        // Initialize Executor
        const executor = new StepExecutor(this.llm, tmpDir, concurrency, this.services, this.pluginRegistry);

        // Initialize Plugin Runner
        const pluginRunner = new PluginRunner(
            this.pluginRegistry,
            this.services,
            this.llm,
            { tmpDir, concurrency }
        );

        // Store final results here. Since rows can multiply, this is a dynamic array.
        const finalResults: Record<string, any>[] = [];

        // Helper to process a single task (Row @ Step)
        const processTask = async (payload: TaskPayload) => {
            const { item, stepIndex } = payload;
            const stepConfig = steps[stepIndex];
            const stepNum = stepIndex + 1;

            try {
                // 1. Prepare View Context (Merge Data Sources)
                // Priority: Workspace > Row > History
                // This allows {{webSearch.link}} to work even if not in row
                const viewContext = {
                    ...item.row,
                    ...item.workspace,
                    steps: item.stepHistory,
                    index: item.originalIndex
                };

                // Compute sanitized version for file system operations
                const sanitizedRow: Record<string, any> = {};
                for (const [key, val] of Object.entries(viewContext)) {
                     const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
                     sanitizedRow[key] = aggressiveSanitize(stringVal);
                }

                // 2. Resolve Step Config
                const resolvedStep = await this.prepareStepConfig(
                    stepConfig, 
                    viewContext, 
                    sanitizedRow, 
                    item.originalIndex, 
                    stepNum, 
                    tmpDir
                );

                console.log(`[Row ${item.originalIndex}] Step ${stepNum} Processing...`);

                // --- EXECUTION LOOP ---
                
                // We start with one item (the current one), but plugins might explode it into multiple.
                // We track the items and the accumulated content parts (prompts) for the model.
                
                interface ActiveContext {
                    item: PipelineItem;
                    contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
                    stepResult: Record<string, any>; // Accumulates results for this step
                }

                let activeContexts: ActiveContext[] = [{
                    item: item,
                    contentParts: [],
                    stepResult: {}
                }];

                // 3. Execute Plugins Sequentially
                for (const pluginDef of resolvedStep.plugins) {
                    const nextContexts: ActiveContext[] = [];

                    for (const ctx of activeContexts) {
                        try {
                            // Prepare View Context for this specific item state
                            const pluginViewContext = {
                                ...ctx.item.row,
                                ...ctx.item.workspace,
                                steps: ctx.item.stepHistory,
                                index: ctx.item.originalIndex
                            };

                            // Execute Plugin
                            const { context: updatedContext, contentParts, pluginResults } = await pluginRunner.run(
                                [pluginDef], // Run one plugin
                                pluginViewContext,
                                stepNum,
                                {
                                    outputDir: resolvedStep.resolvedOutputDir,
                                    tempDir: resolvedStep.resolvedTempDir || tmpDir,
                                    basename: resolvedStep.outputBasename,
                                    ext: resolvedStep.outputExtension
                                }
                            );

                            // Get the specific result for this plugin
                            const resultData = pluginResults[pluginDef.name];
                            
                            // Apply Output Strategy (Merge/Explode)
                            // ResultProcessor returns new PipelineItems based on the strategy
                            // It handles updating workspace and row
                            const processedItems = ResultProcessor.process(
                                [ctx.item], 
                                resultData, 
                                pluginDef.output,
                                toCamel(pluginDef.name) // Ensure consistent camelCase key in workspace
                            );

                            // Create new contexts for the next plugin/model
                            for (const newItem of processedItems) {
                                nextContexts.push({
                                    item: newItem,
                                    contentParts: [...ctx.contentParts, ...contentParts],
                                    stepResult: { 
                                        ...ctx.stepResult, 
                                        [toCamel(pluginDef.name)]: resultData
                                    }
                                });
                            }
                        } catch (pluginError: any) {
                            console.error(`[Row ${item.originalIndex}] Step ${stepNum} Plugin '${pluginDef.name}' Failed:`, pluginError);
                            // Log error
                            rowErrors.push({ index: item.originalIndex, error: pluginError });
                            // Stop processing this branch (Drop the row)
                        }
                    }
                    activeContexts = nextContexts;
                }

                // 4. Execute Model (for each active context)
                const nextItemsForQueue: PipelineItem[] = [];

                for (const ctx of activeContexts) {
                    try {
                        // Prepare View Context for Model
                        const modelViewContext = {
                            ...ctx.item.row,
                            ...ctx.item.workspace,
                            steps: ctx.item.stepHistory,
                            index: ctx.item.originalIndex
                        };

                        // --- PREPROCESS PROMPTS ---
                        // Run preprocessors on the accumulated content parts + user prompt parts
                        // We need to combine them first to allow preprocessors to see the full context
                        let effectiveParts = [...ctx.contentParts, ...resolvedStep.userPromptParts];
                        
                        // Run all registered preprocessors
                        for (const ppDef of resolvedStep.preprocessors) {
                            const preprocessor = this.preprocessorRegistry.get(ppDef.name);
                            if (preprocessor) {
                                effectiveParts = await preprocessor.process(effectiveParts, {
                                    row: modelViewContext,
                                    services: this.services
                                }, ppDef.config);
                            }
                        }

                        // Execute Model
                        const result = await executor.executeModel(
                            modelViewContext,
                            ctx.item.originalIndex,
                            stepNum,
                            resolvedStep,
                            ctx.item.history,
                            effectiveParts // Pass the preprocessed parts
                        );

                        // Update Step Result
                        const currentStepResult = {
                            ...ctx.stepResult,
                            modelOutput: result.modelResult
                        };

                        // Apply Model Output Strategy
                        const processedItems = ResultProcessor.process(
                            [ctx.item], 
                            result.modelResult, 
                            resolvedStep.output,
                            'modelOutput'
                        );

                        // Prepare for next step
                        for (const finalItem of processedItems) {
                            // Update history for this branch
                            finalItem.history = [
                                ...finalItem.history,
                                { role: 'user', content: resolvedStep.userPromptParts },
                                result.historyMessage
                            ];
                            finalItem.stepHistory = [...finalItem.stepHistory, currentStepResult];
                            
                            nextItemsForQueue.push(finalItem);
                        }
                    } catch (modelError: any) {
                        console.error(`[Row ${item.originalIndex}] Step ${stepNum} Model Execution Failed:`, modelError.message);
                        // Log error
                        rowErrors.push({ index: item.originalIndex, error: modelError });
                        // Stop processing this branch (Drop the row)
                    }
                }

                // 5. Queue Next Steps or Save
                if (stepIndex === steps.length - 1) {
                    // Finished pipeline for these items
                    // We only save the 'row' part of the PipelineItem
                    finalResults.push(...nextItemsForQueue.map(i => i.row));
                } else {
                    // Queue next step
                    for (const nextItem of nextItemsForQueue) {
                        queue.add(() => processTask({
                            item: nextItem,
                            stepIndex: stepIndex + 1
                        }));
                    }
                }

            } catch (err) {
                // This catches errors in the setup phase (before the loop)
                console.error(`[Row ${item.originalIndex}] Step ${stepNum} Setup Error:`, err);
                rowErrors.push({ index: item.originalIndex, error: err });
                // Stop processing this branch (Drop the row)
            }
        };

        try {
            // Initial Queue Population
            for (let i = 0; i < dataToProcess.length; i++) {
                // Calculate original index based on offset
                const originalIndex = offset + i;
                
                const initialItem: PipelineItem = {
                    row: dataToProcess[i],
                    workspace: {},
                    stepHistory: [],
                    history: [],
                    originalIndex: originalIndex
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
            // Save updated data
            const ext = path.extname(dataFilePath);
            
            let finalOutputPath: string;
            if (dataOutputPath) {
                finalOutputPath = dataOutputPath;
            } else {
                const basename = path.basename(dataFilePath, ext);
                finalOutputPath = path.join(path.dirname(dataFilePath), `${basename}_processed${ext}`);
            }

            // Filter out empty results (if any)
            const validResults = finalResults.filter(r => r !== undefined && r !== null);

            if (validResults.length === 0) {
                console.warn("No results to save.");
                return;
            }

            if (ext === '.json') {
                await fsPromises.writeFile(finalOutputPath, JSON.stringify(validResults, null, 2));
            } else {
                try {
                    // Flatten nested objects (e.g. { ceo: { name: "..." } } -> "ceo.name")
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

        // 1. Output Path & Directory
        if (stepConfig.outputTemplate) {
            const delegate = Handlebars.compile(stepConfig.outputTemplate, { noEscape: true });
            resolvedStep.outputPath = delegate(sanitizedRow);
            
            // Calculate the directory for final assets
            resolvedStep.resolvedOutputDir = path.dirname(resolvedStep.outputPath);
            await ensureDir(resolvedStep.resolvedOutputDir);

            // Parse filename components
            const parsed = path.parse(resolvedStep.outputPath);
            resolvedStep.outputBasename = parsed.name;
            resolvedStep.outputExtension = parsed.ext;
        } else {
            // Default values if no output path
            resolvedStep.outputBasename = `output_${rowIndex}_${stepIndex}`;
            resolvedStep.outputExtension = stepConfig.aspectRatio ? '.png' : '.txt';
        }

        // 2. Temp Directory (Structured)
        if (resolvedStep.resolvedOutputDir) {
            // Mirror the output directory structure inside the temp directory
            resolvedStep.resolvedTempDir = path.join(globalTmpDir, resolvedStep.resolvedOutputDir);
        } else {
            // Pattern: .tmp/001_02 (Row 1, Step 2)
            const rowStr = String(rowIndex).padStart(3, '0');
            const stepStr = String(stepIndex).padStart(2, '0');
            resolvedStep.resolvedTempDir = path.join(globalTmpDir, `${rowStr}_${stepStr}`);
        }
        await ensureDir(resolvedStep.resolvedTempDir);

        // 3. Schema Path
        if (stepConfig.schemaPath) {
            try {
                resolvedStep.jsonSchema = await SchemaHelper.loadAndRenderSchema(stepConfig.schemaPath, sanitizedRow);
            } catch (e) {
                console.warn(`[Row ${rowIndex}] Failed to load/parse schema from '${stepConfig.schemaPath}':`, e);
            }
        }

        // 4. User Prompt
        if (stepConfig.userPromptParts.length === 1 && stepConfig.userPromptParts[0].type === 'text' && stepConfig.userPromptParts[0].text.includes('{{')) {
            const template = stepConfig.userPromptParts[0].text;
            resolvedStep.userPromptParts = await PromptResolver.resolve(template, viewContext);
        }

        // 5. Pass Plugins (Raw)
        // We no longer prepare them here. They are prepared JIT in PluginRunner to allow chaining.
        resolvedStep.plugins = stepConfig.plugins;

        return resolvedStep;
    }
}

// Helper to convert kebab-case plugin name to camelCase for workspace keys
const toCamel = (s: string) => {
    return s.replace(/-([a-z0-9])/g, (g) => g[1].toUpperCase());
};
