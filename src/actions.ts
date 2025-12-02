// @ts-nocheck
import fsPromises from 'fs/promises';
import path from 'path';
import { Parser } from 'json2csv';
import PQueue from 'p-queue';
import { RuntimeConfig, StepConfig } from './types.js';
import { StepExecutor } from './StepExecutor.js';
import { getConfig } from "./getConfig.js";
import { PromptResolver } from './utils/PromptResolver.js';
import { resolvePromptInput, aggressiveSanitize } from './utils/fileUtils.js';
import { PluginRegistry } from './plugins/PluginRegistry.js';
import { PluginServices } from './plugins/types.js';
// ImageSearchPlugin registration moved to StepRegistry to ensure CLI flags are registered early

export async function runAction(config: RuntimeConfig) {
    const { concurrency, taskConcurrency, data, steps, dataFilePath, dataOutputPath } = config;

    console.log(`Initializing with concurrency: ${concurrency} (LLM) / ${taskConcurrency} (Tasks)`);
    const { llm, imageSearch, aiImageSearch, fetcher } = await getConfig({ concurrency });

    const services: PluginServices = {
        imageSearch,
        aiImageSearch,
        fetcher
    };

    // Plugins are already registered in StepRegistry during CLI setup
    const registry = PluginRegistry.getInstance();

    console.log(`Found ${data.length} rows to process.`);
    console.log(`Pipeline has ${steps.length} steps.`);

    const rowErrors: { index: number, error: any }[] = [];
    
    // Initialize Task Queue
    const queue = new PQueue({ concurrency: taskConcurrency });

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
                    const executor = new StepExecutor(llm, config.tmpDir, concurrency, services);

                    for (let i = 0; i < steps.length; i++) {
                        const stepIndex = i + 1;
                        const stepConfig = steps[i];

                        // --- Dynamic Resolution Phase ---
                        
                        const resolvedStep: StepConfig = { ...stepConfig };

                        // 1. Output Path
                        if (stepConfig.outputTemplate) {
                            const Handlebars = (await import('handlebars')).default;
                            const delegate = Handlebars.compile(stepConfig.outputTemplate, { noEscape: true });
                            resolvedStep.outputPath = delegate(sanitizedRow);
                        }

                        // 2. Schema Path
                        if (stepConfig.schemaPath && stepConfig.schemaPath.includes('{{')) {
                            const parts = await PromptResolver.resolve(stepConfig.schemaPath, sanitizedRow);
                            if (parts.length > 0 && parts[0].type === 'text') {
                                try {
                                    resolvedStep.jsonSchema = JSON.parse(parts[0].text);
                                } catch (e) {
                                    console.warn(`[Row ${index}] Failed to parse dynamic schema:`, e);
                                }
                            }
                        }

                        // 3. User Prompt
                        if (stepConfig.userPromptParts.length === 1 && stepConfig.userPromptParts[0].type === 'text' && stepConfig.userPromptParts[0].text.includes('{{')) {
                            const template = stepConfig.userPromptParts[0].text;
                            resolvedStep.userPromptParts = await PromptResolver.resolve(template, rawRow);
                        }

                        // 4. Prepare Plugins
                        const preparedPlugins: Record<string, any> = {};
                        for (const [name, pluginConfig] of Object.entries(stepConfig.plugins)) {
                            const plugin = registry.get(name);
                            if (plugin) {
                                preparedPlugins[name] = await plugin.prepare(pluginConfig, rawRow);
                            }
                        }
                        resolvedStep.plugins = preparedPlugins;

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
