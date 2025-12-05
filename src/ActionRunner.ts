import fsPromises from 'fs/promises';
import path from 'path';
import { Parser } from 'json2csv';
import PQueue from 'p-queue';
import Handlebars from 'handlebars';
import { LlmClient } from 'llm-fns';
import { RuntimeConfig, StepConfig, PluginConfigDefinition } from './types.js';
import { StepExecutor } from './StepExecutor.js';
import { PromptResolver } from './utils/PromptResolver.js';
import { aggressiveSanitize, ensureDir } from './utils/fileUtils.js';
import { PluginServices } from './plugins/types.js';
import { PluginRegistry } from './plugins/PluginRegistry.js';

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

                // 3. Execute Step
                const result = await executor.execute(
                    viewContext,
                    originalIndex,
                    stepNum,
                    resolvedStep,
                    history
                );

                // 4. Process Results & Determine Next State
                // We need to build the "currentStep" object to add to stepHistory
                const currentStepResult: Record<string, any> = {};
                
                // Start with a clone of the current data
                let nextDataBase = { ...currentData };

                // A. Handle Plugin Results
                for (const [pluginName, pluginData] of Object.entries(result.pluginResults)) {
                    currentStepResult[pluginName] = pluginData;
                    
                    // Check if this plugin should export data to the row
                    const pluginDef = resolvedStep.plugins.find(p => p.name === pluginName);
                    if (pluginDef && pluginDef.exportData) {
                        // Direct assignment / Merge
                        // If pluginData is object, merge? Or assign to key?
                        // Previous logic was: context.outputData[pluginName] = pluginData;
                        // But if it's an object, maybe we want to merge properties?
                        // For now, stick to assignment to avoid collisions unless explicitly handled.
                        nextDataBase[pluginName] = pluginData;
                    }
                }

                // B. Handle Model Result
                if (result.modelResult) {
                    currentStepResult.modelOutput = result.modelResult;
                }

                // C. Determine Next Rows (Branching Logic)
                let nextRows: Record<string, any>[] = [];
                const modelResult = result.modelResult;

                if (resolvedStep.strategy === 'explode') {
                    // EXPLODE STRATEGY
                    if (Array.isArray(modelResult)) {
                        // Create a new row for each item
                        nextRows = modelResult.map(item => {
                            const rowClone = { ...nextDataBase };
                            
                            if (resolvedStep.outputColumn) {
                                // Assign item to specific column
                                rowClone[resolvedStep.outputColumn] = item;
                            } else if (typeof item === 'object' && item !== null) {
                                // Merge item properties into row
                                Object.assign(rowClone, item);
                            } else {
                                // Primitive value without output column? 
                                // We can't merge "5" into an object. 
                                // Fallback: assign to 'value' or 'modelOutput'
                                rowClone.modelOutput = item;
                            }
                            return rowClone;
                        });
                    } else {
                        // Not an array, treat as single item (Explode of 1)
                        const rowClone = { ...nextDataBase };
                        if (resolvedStep.exportResult) {
                            if (resolvedStep.outputColumn) {
                                rowClone[resolvedStep.outputColumn] = modelResult;
                            } else if (typeof modelResult === 'object' && modelResult !== null) {
                                Object.assign(rowClone, modelResult);
                            }
                        }
                        nextRows = [rowClone];
                    }
                } else {
                    // MERGE STRATEGY (Default)
                    const rowClone = { ...nextDataBase };
                    
                    if (resolvedStep.exportResult && modelResult) {
                        if (resolvedStep.outputColumn) {
                            // If output column is specified, we can save anything (including arrays) there
                            // If it's an array/object, it will be stringified by CSV parser later, or we can keep it as object for JSON output
                            rowClone[resolvedStep.outputColumn] = modelResult;
                        } else {
                            // No output column -> Merge into root
                            if (Array.isArray(modelResult)) {
                                throw new Error(`[Row ${originalIndex}] Step ${stepNum}: Cannot merge an Array result into the root row. Use --explode to create multiple rows, or --output-column to save the array to a specific field.`);
                            }
                            
                            if (typeof modelResult === 'object' && modelResult !== null) {
                                Object.assign(rowClone, modelResult);
                            }
                            // If primitive and no output column, it's effectively lost/ignored for the row data, 
                            // but kept in stepHistory.
                        }
                    }
                    nextRows = [rowClone];
                }

                // 5. Update History
                const newHistoryItems = [
                    { role: 'user', content: resolvedStep.userPromptParts },
                    result.historyMessage
                ];
                const nextHistory = [...history, ...newHistoryItems];
                
                const nextStepHistory = [...stepHistory, currentStepResult];

                // 6. Queue Next Steps or Save
                if (stepIndex === steps.length - 1) {
                    // Finished pipeline for these rows
                    finalResults.push(...nextRows);
                } else {
                    // Queue next step
                    for (const row of nextRows) {
                        queue.add(() => processTask({
                            data: row,
                            stepIndex: stepIndex + 1,
                            stepHistory: nextStepHistory,
                            history: nextHistory,
                            originalIndex
                        }));
                    }
                }

            } catch (err) {
                console.error(`[Row ${originalIndex}] Step ${stepNum} Error:`, err);
                rowErrors.push({ index: originalIndex, error: err });
                // On error, we stop this branch. 
                // Optionally, we could push the current state to finalResults to preserve partial data?
                // For now, let's push the *original* data to ensure we don't lose the row entirely, 
                // or maybe the current accumulated data?
                // Let's push current accumulated data so we see how far we got.
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
                    const parser = new Parser();
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
