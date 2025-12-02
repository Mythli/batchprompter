import fsPromises from 'fs/promises';
import path from 'path';
import { Parser } from 'json2csv';
import PQueue from 'p-queue';
import Handlebars from 'handlebars';
import { LlmClient } from 'llm-fns';
import { RuntimeConfig, StepConfig } from './types.js';
import { StepExecutor } from './StepExecutor.js';
import { PromptResolver } from './utils/PromptResolver.js';
import { aggressiveSanitize, ensureDir } from './utils/fileUtils.js';
import { PluginServices } from './plugins/types.js';
import { PluginRegistry } from './plugins/PluginRegistry.js';

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

        try {
            // Process Rows
            for (let index = 0; index < data.length; index++) {
                const rawRow = data[index];
                
                // Compute sanitized version upfront for file system operations
                const sanitizedRow: Record<string, any> = {};
                for (const [key, val] of Object.entries(rawRow)) {
                     const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
                     sanitizedRow[key] = aggressiveSanitize(stringVal);
                }
                
                queue.add(async () => {
                    try {
                        // History of conversation (User + Assistant only)
                        // We maintain one history per row across all steps
                        const persistentHistory: any[] = [];

                        for (let i = 0; i < steps.length; i++) {
                            const stepIndex = i + 1;
                            const stepConfig = steps[i];

                            // --- Dynamic Resolution Phase ---
                            const resolvedStep = await this.prepareStepConfig(
                                stepConfig, 
                                rawRow, 
                                sanitizedRow, 
                                index, 
                                stepIndex, 
                                tmpDir
                            );

                            console.log(`[Row ${index}] Step ${stepIndex} Processing...`);

                            const result = await executor.execute(
                                rawRow,
                                index,
                                stepIndex,
                                resolvedStep,
                                persistentHistory
                            );

                            persistentHistory.push({ role: 'user', content: resolvedStep.userPromptParts });
                            persistentHistory.push(result);
                        }

                    } catch (err) {
                        console.error(`[Row ${index}] Error:`, err);
                        rowErrors.push({ index, error: err });
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
            const isColumnMode = steps.some(s => !!s.outputColumn);

            let finalOutputPath: string;
            if (dataOutputPath) {
                finalOutputPath = dataOutputPath;
            } else if (isColumnMode) {
                finalOutputPath = dataFilePath;
            } else {
                const basename = path.basename(dataFilePath, ext);
                finalOutputPath = path.join(path.dirname(dataFilePath), `${basename}_processed${ext}`);
            }

            if (ext === '.json') {
                await fsPromises.writeFile(finalOutputPath, JSON.stringify(data, null, 2));
            } else {
                try {
                    const parser = new Parser();
                    const csv = parser.parse(data);
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
        rawRow: Record<string, any>,
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
        // Always attempt to resolve the schema path for every row.
        // This handles both static paths (re-read) and dynamic paths (Handlebars + read).
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
            resolvedStep.userPromptParts = await PromptResolver.resolve(template, rawRow);
        }

        // 5. Prepare Plugins
        const preparedPlugins: Record<string, any> = {};
        for (const [name, pluginConfig] of Object.entries(stepConfig.plugins)) {
            const plugin = this.pluginRegistry.get(name);
            if (plugin) {
                preparedPlugins[name] = await plugin.prepare(pluginConfig, rawRow);
            }
        }
        resolvedStep.plugins = preparedPlugins;

        return resolvedStep;
    }
}
