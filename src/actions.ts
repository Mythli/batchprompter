import fsPromises from 'fs/promises';
import path from 'path';
import { Parser } from 'json2csv';
import PQueue from 'p-queue';
import { RuntimeConfig, StepConfig } from './types.js';
import { StepExecutor } from './StepExecutor.js';
import { getConfig } from "./getConfig.js";
import { PromptResolver } from './utils/PromptResolver.js';
import { resolvePromptInput } from './utils/fileUtils.js';

export async function runAction(config: RuntimeConfig) {
    const { concurrency, taskConcurrency, data, steps, dataFilePath, dataOutputPath } = config;

    console.log(`Initializing with concurrency: ${concurrency} (LLM) / ${taskConcurrency} (Tasks)`);
    const { llm, aiImageSearch } = await getConfig({ concurrency });

    console.log(`Found ${data.length} rows to process.`);
    console.log(`Pipeline has ${steps.length} steps.`);

    const rowErrors: { index: number, error: any }[] = [];
    
    // Initialize Task Queue
    const queue = new PQueue({ concurrency: taskConcurrency });

    try {
        // Process Rows
        for (let index = 0; index < data.length; index++) {
            const row = data[index];
            
            queue.add(async () => {
                try {
                    // History of conversation (User + Assistant only)
                    // We maintain one history per row across all steps
                    const persistentHistory: any[] = [];
                    const executor = new StepExecutor(llm, aiImageSearch);

                    for (let i = 0; i < steps.length; i++) {
                        const stepIndex = i + 1;
                        const stepConfig = steps[i];

                        // --- Dynamic Resolution Phase ---
                        // Some config values might be templates (e.g. output path, schema path)
                        // We resolve them here using the current row.
                        
                        const resolvedStep: StepConfig = { ...stepConfig };

                        // 1. Output Path
                        if (stepConfig.outputTemplate) {
                            // We use PromptResolver logic or simple Handlebars? 
                            // PromptResolver handles paths.
                            // But output path is just a string template.
                            const Handlebars = (await import('handlebars')).default;
                            const delegate = Handlebars.compile(stepConfig.outputTemplate, { noEscape: true });
                            resolvedStep.outputPath = delegate(row);
                        }

                        // 2. Schema (if dynamic)
                        if (stepConfig.schemaPath && stepConfig.schemaPath.includes('{{')) {
                            const parts = await PromptResolver.resolve(stepConfig.schemaPath, row);
                            if (parts.length > 0 && parts[0].type === 'text') {
                                // It resolved to a file content or text
                                // If it was a file path, resolvePromptInput read it.
                                // If it was raw text, it's the schema.
                                // But resolvePromptInput returns content.
                                // We need to parse it.
                                try {
                                    resolvedStep.jsonSchema = JSON.parse(parts[0].text);
                                } catch (e) {
                                    console.warn(`[Row ${index}] Failed to parse dynamic schema:`, e);
                                }
                            }
                        }

                        // 3. User Prompt (Positional)
                        // If it was marked as dynamic (text type with {{), resolve it now
                        if (stepConfig.userPromptParts.length === 1 && stepConfig.userPromptParts[0].type === 'text' && stepConfig.userPromptParts[0].text.includes('{{')) {
                            // It's a path template
                            const template = stepConfig.userPromptParts[0].text;
                            // Resolve path using row context
                            resolvedStep.userPromptParts = await PromptResolver.resolve(template, row);
                        }

                        // 4. Image Search Queries (Dynamic)
                        if (resolvedStep.imageSearch?.query?.includes('{{')) {
                            const Handlebars = (await import('handlebars')).default;
                            resolvedStep.imageSearch.query = Handlebars.compile(resolvedStep.imageSearch.query, { noEscape: true })(row);
                        }

                        console.log(`[Row ${index}] Step ${stepIndex} Processing...`);

                        const result = await executor.execute(
                            row,
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
        // Save updated data (Write-on-Finish / Write-on-Crash)
        // Because 'data' is mutated in place during execution, we can simply write it out.
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
