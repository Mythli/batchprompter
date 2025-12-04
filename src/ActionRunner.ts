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

interface ExecutionContext {
    initialData: Record<string, any>;
    outputData: Record<string, any>;
    stepHistory: Record<string, any>[]; // Array of results from previous steps
    currentStep: Record<string, any>;   // Results for the current step
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

        // Store final results here to write to disk later
        const finalResults: Record<string, any>[] = new Array(data.length);

        try {
            // Process Rows
            for (let index = 0; index < data.length; index++) {
                const rawRow = data[index];
                
                queue.add(async () => {
                    try {
                        // Initialize Context
                        const context: ExecutionContext = {
                            initialData: { ...rawRow },
                            outputData: { ...rawRow },
                            stepHistory: [],
                            currentStep: {}
                        };

                        // History of conversation (User + Assistant only)
                        const persistentHistory: any[] = [];

                        for (let i = 0; i < steps.length; i++) {
                            const stepIndex = i + 1;
                            const stepConfig = steps[i];

                            // 1. Prepare View Context (Merge Data Sources)
                            // Priority: Current Step > Output Data > History
                            const viewContext = {
                                ...context.outputData,
                                ...context.currentStep,
                                steps: context.stepHistory,
                                index: index
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
                                index, 
                                stepIndex, 
                                tmpDir
                            );

                            console.log(`[Row ${index}] Step ${stepIndex} Processing...`);

                            // 3. Execute Step
                            const result = await executor.execute(
                                viewContext,
                                index,
                                stepIndex,
                                resolvedStep,
                                persistentHistory
                            );

                            // 4. Handle Plugin Results
                            // Store in currentStep for immediate access in this step (if needed by subsequent logic, though unlikely)
                            // and for history.
                            // Also handle export logic.
                            for (const [pluginName, pluginData] of Object.entries(result.pluginResults)) {
                                context.currentStep[pluginName] = pluginData;
                                
                                // Check if this plugin should export data to the final output
                                const pluginDef = resolvedStep.plugins.find(p => p.name === pluginName);
                                if (pluginDef && pluginDef.exportData) {
                                    // Direct assignment, NO merging
                                    context.outputData[pluginName] = pluginData;
                                }
                            }

                            // 5. Handle Model Result
                            if (result.modelResult) {
                                context.currentStep.modelOutput = result.modelResult;
                                
                                if (resolvedStep.exportResult) {
                                    if (resolvedStep.outputColumn) {
                                        context.outputData[resolvedStep.outputColumn] = result.modelResult;
                                    } else {
                                        // If no column specified but export requested, maybe merge if object?
                                        // Or just ignore? The CLI schema implies outputColumn is usually set if export is desired.
                                        // But if it's a JSON object and we want to merge it into root...
                                        if (typeof result.modelResult === 'object' && result.modelResult !== null) {
                                            Object.assign(context.outputData, result.modelResult);
                                        }
                                    }
                                }
                            }

                            // 6. Update History
                            persistentHistory.push({ role: 'user', content: resolvedStep.userPromptParts });
                            persistentHistory.push(result.historyMessage);

                            // Archive current step to history
                            context.stepHistory.push({ ...context.currentStep });
                            // Clear current step for next iteration
                            context.currentStep = {};
                        }

                        // Store final result
                        finalResults[index] = context.outputData;

                    } catch (err) {
                        console.error(`[Row ${index}] Error:`, err);
                        rowErrors.push({ index, error: err });
                        // Preserve original data on error
                        finalResults[index] = rawRow; 
                    }
                });
            }

            await queue.onIdle();
            console.log("All tasks completed.");

            if (rowErrors.length > 0) {
                console.error(`\n⚠️  Completed with ${rowErrors.length} errors out of ${data.length} rows.`);
            } else {
                console.log(`\n✅ Successfully processed all ${data.length} rows.\n`);
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

            // Filter out empty results (if any rows were skipped entirely, though array is pre-allocated)
            const validResults = finalResults.filter(r => r !== undefined);

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

        // 5. Prepare Plugins
        const preparedPlugins: PluginConfigDefinition[] = [];
        for (const pluginDef of stepConfig.plugins) {
            const plugin = this.pluginRegistry.get(pluginDef.name);
            if (plugin) {
                preparedPlugins.push({
                    name: pluginDef.name,
                    config: await plugin.prepare(pluginDef.config, viewContext),
                    exportData: pluginDef.exportData
                });
            }
        }
        resolvedStep.plugins = preparedPlugins;

        return resolvedStep;
    }
}
