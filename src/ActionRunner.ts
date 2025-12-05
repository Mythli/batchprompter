import fsPromises from 'fs/promises';
import path from 'path';
import { Parser, transforms } from 'json2csv';
import PQueue from 'p-queue';
import Handlebars from 'handlebars';
import { LlmClient } from 'llm-fns';
import { RuntimeConfig, StepConfig } from './types.js';
import { StepExecutor } from './StepExecutor.js';
import { PromptResolver } from './utils/PromptResolver.js';
import { aggressiveSanitize, ensureDir } from './utils/fileUtils.js';
import { PluginServices } from './plugins/types.js';
import { PluginRegistry } from './plugins/PluginRegistry.js';
import { PluginRunner } from './core/PluginRunner.js';
import { ResultProcessor } from './core/ResultProcessor.js';
import OpenAI from 'openai';

interface TaskPayload {
    data: Record<string, any>; // The accumulated row data
    stepHistory: Record<string, any>[]; // Array of results from previous steps
    stepIndex: number; // The index of the step to execute
    history: any[]; // Conversation history (User + Assistant)
    originalIndex: number; // For logging/debugging
}

export class ActionRunner {
    constructor(
        private llm: LlmClient,
        private services: PluginServices,
        private pluginRegistry: PluginRegistry
    ) {}

    async run(config: RuntimeConfig) {
        const { concurrency, taskConcurrency, data, steps, dataFilePath, dataOutputPath, tmpDir } = config;

        console.log(`Initializing with concurrency: ${concurrency} (LLM) / ${taskConcurrency} (Tasks)`);
        console.log(`Found ${data.length} rows to process.`);
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
            const { data: currentData, stepHistory, stepIndex, history, originalIndex } = payload;
            const stepConfig = steps[stepIndex];
            const stepNum = stepIndex + 1;

            try {
                // 1. Prepare View Context (Merge Data Sources)
                // Priority: Current Data > History
                const viewContext = {
                    ...currentData,
                    steps: stepHistory,
                    index: originalIndex
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
                    originalIndex, 
                    stepNum, 
                    tmpDir
                );

                console.log(`[Row ${originalIndex}] Step ${stepNum} Processing...`);

                // --- EXECUTION LOOP ---
                
                // We start with one row (the current one), but plugins might explode it into multiple.
                // We track the rows and the accumulated content parts (prompts) for the model.
                // Note: If a plugin explodes the row, the content parts must be duplicated/associated with each new row.
                // To simplify, we will maintain a list of "Active Contexts".
                
                interface ActiveContext {
                    row: Record<string, any>;
                    contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
                    stepResult: Record<string, any>; // Accumulates results for this step
                }

                let activeContexts: ActiveContext[] = [{
                    row: viewContext,
                    contentParts: [],
                    stepResult: {}
                }];

                // 3. Execute Plugins Sequentially
                for (const pluginDef of resolvedStep.plugins) {
                    const nextContexts: ActiveContext[] = [];

                    for (const ctx of activeContexts) {
                        // Execute Plugin for this specific row context
                        const { context: updatedRow, contentParts, pluginResults } = await pluginRunner.run(
                            [pluginDef], // Run one plugin
                            ctx.row,
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
                        // ResultProcessor returns new rows based on the strategy
                        const processedRows = ResultProcessor.process([ctx.row], resultData, pluginDef.output);

                        // Create new contexts for the next plugin/model
                        for (const newRow of processedRows) {
                            // We must preserve the accumulated content parts
                            // And add the new content parts from this plugin execution
                            nextContexts.push({
                                row: newRow,
                                contentParts: [...ctx.contentParts, ...contentParts],
                                stepResult: { 
                                    ...ctx.stepResult, 
                                    [pluginDef.name]: resultData,
                                    // If the plugin merged data into the row, it's already in newRow.
                                    // But we also keep it in stepResult for history tracking.
                                }
                            });
                        }
                    }
                    activeContexts = nextContexts;
                }

                // 4. Execute Model (for each active context)
                const nextRowsForQueue: Record<string, any>[] = [];
                const nextStepHistoryForQueue: Record<string, any>[] = []; // We need to pair history with rows

                for (const ctx of activeContexts) {
                    // Execute Model
                    const result = await executor.executeModel(
                        ctx.row,
                        originalIndex,
                        stepNum,
                        resolvedStep,
                        history,
                        ctx.contentParts
                    );

                    // Update Step Result
                    const currentStepResult = {
                        ...ctx.stepResult,
                        modelOutput: result.modelResult
                    };

                    // Apply Model Output Strategy
                    const processedRows = ResultProcessor.process([ctx.row], result.modelResult, resolvedStep.output);

                    // Prepare for next step
                    for (const finalRow of processedRows) {
                        nextRowsForQueue.push(finalRow);
                        
                        // Update history for this branch
                        // Note: We are duplicating the history message for all exploded rows from the model
                        // This is acceptable as they share the same generation origin.
                        nextStepHistoryForQueue.push({
                            history: [
                                ...history,
                                { role: 'user', content: resolvedStep.userPromptParts },
                                result.historyMessage
                            ],
                            stepHistory: [...stepHistory, currentStepResult]
                        });
                    }
                }

                // 5. Queue Next Steps or Save
                if (stepIndex === steps.length - 1) {
                    // Finished pipeline for these rows
                    finalResults.push(...nextRowsForQueue);
                } else {
                    // Queue next step
                    for (let i = 0; i < nextRowsForQueue.length; i++) {
                        const row = nextRowsForQueue[i];
                        const hist = nextStepHistoryForQueue[i];
                        
                        queue.add(() => processTask({
                            data: row,
                            stepIndex: stepIndex + 1,
                            stepHistory: hist.stepHistory,
                            history: hist.history,
                            originalIndex
                        }));
                    }
                }

            } catch (err) {
                console.error(`[Row ${originalIndex}] Step ${stepNum} Error:`, err);
                rowErrors.push({ index: originalIndex, error: err });
                finalResults.push(currentData);
            }
        };

        try {
            // Initial Queue Population
            for (let index = 0; index < data.length; index++) {
                queue.add(() => processTask({
                    data: data[index],
                    stepHistory: [],
                    stepIndex: 0,
                    history: [],
                    originalIndex: index
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
                const parts = await PromptResolver.resolve(stepConfig.schemaPath, sanitizedRow);
                if (parts.length > 0 && parts[0].type === 'text') {
                    resolvedStep.jsonSchema = JSON.parse(parts[0].text);
                }
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
