#!/usr/bin/env node
import { Command } from 'commander';
import 'dotenv/config';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { Parser, transforms } from 'json2csv';
import {
    createDefaultRegistry,
    getConfig,
    ServiceCapabilities,
    PipelineConfigSchema,
    DebugLogger,
    ConfigRefiner,
    InMemoryConfigExecutor,
    getUniqueRows
} from 'batchprompt';
import { StepRegistry } from './StepRegistry.js';
import { FileSystemArtifactHandler } from './handlers/FileSystemArtifactHandler.js';
import { FileSystemContentResolver } from './io/FileSystemContentResolver.js';
import { FileAdapter } from './io/FileAdapter.js';
import Papa from 'papaparse';

const program = new Command();

program
    .name('batchprompt')
    .description('Generate images and text from CSV or JSON data using AI');

const generateCmd = program.command('generate')
    .description('Generate content (text and/or images) from data piped via stdin')
    .argument('[template-files...]', 'Path to the prompt template files (text, image, audio, or directory)');

// Create a registry for CLI configuration purposes only
// At this point we don't know actual capabilities, so we assume all are available
// Actual validation happens during normalize() when real capabilities are known
const cliCapabilities: ServiceCapabilities = {
    hasSerper: true,  // Assume available for CLI registration
    hasPuppeteer: true
};
const cliRegistry = createDefaultRegistry(cliCapabilities);

// Register all step arguments
StepRegistry.registerStepArgs(generateCmd, cliRegistry);

generateCmd.action(async (templateFilePaths, options) => {
    let puppeteerHelperInstance;
    try {
        // Initialize Content Resolver for CLI (File System access)
        const contentResolver = new FileSystemContentResolver();

        // Get the runner from DI first to get actual capabilities
        // Pass the contentResolver to getConfig so Core uses FS instead of Memory
        const { actionRunner, puppeteerHelper, config: resolvedConfig, pluginRegistry, globalContext } = await getConfig({ contentResolver });
        puppeteerHelperInstance = puppeteerHelper;

        let fileConfig = {};

        // Check if we're using a config file
        if (options.config) {
            const fileAdapter = new FileAdapter();
            fileConfig = await fileAdapter.load(options.config);
        }

        // Parse Config (Merge File + CLI)
        const config = await StepRegistry.parseConfig(fileConfig, options, templateFilePaths, pluginRegistry, contentResolver);

        // Initialize Artifact Handler
        // We use the tmpDir from the parsed runtime config
        new FileSystemArtifactHandler(globalContext.events, config.tmpDir);

        // Initialize Debug Logger
        new DebugLogger(globalContext.events);

        // Collect results for output
        const results: any[] = [];
        globalContext.events.on('row:end', ({ result }) => {
            results.push(result);
        });

        // Update the runtime config with the resolved concurrency values if they weren't in CLI args
        // This ensures ActionRunner uses the correct values (Env > Default) if CLI didn't specify them
        const finalConfig = {
            ...config,
            concurrency: config.concurrency ?? resolvedConfig.GPT_CONCURRENCY,
            taskConcurrency: config.taskConcurrency ?? resolvedConfig.TASK_CONCURRENCY
        };

        // Run
        await actionRunner.run(finalConfig);

        // Write Data Output (CSV/JSON)
        if (config.dataOutputPath && results.length > 0) {
            const outDir = path.dirname(config.dataOutputPath);
            if (!fs.existsSync(outDir)) {
                fs.mkdirSync(outDir, { recursive: true });
            }

            if (config.dataOutputPath.endsWith('.json')) {
                fs.writeFileSync(config.dataOutputPath, JSON.stringify(results, null, 2));
            } else {
                const parser = new Parser({
                    transforms: [
                        transforms.flatten({ objects: true, arrays: false, separator: '.' })
                    ]
                });
                const csv = parser.parse(results);
                fs.writeFileSync(config.dataOutputPath, csv);
            }
            console.log(`\nData written to ${config.dataOutputPath}`);
        }

        // Cleanup
        if (puppeteerHelperInstance) {
            await puppeteerHelperInstance.close();
        }
        process.exit(0);
    } catch (e: any) {
        console.error(e);
        // Cleanup on error
        if (puppeteerHelperInstance) {
            await puppeteerHelperInstance.close();
        }
        process.exit(1);
    }
});

program.command('init')
    .description('Initialize a new configuration file using AI')
    .argument('[prompt]', 'Description of what you want to do')
    .option('-d, --data <file>', 'Path to sample data file (CSV/JSON) to infer schema')
    .option('-o, --output <file>', 'Output file path')
    .option('--model <model>', 'Model to use for generation', 'google/gemini-3-flash-preview')
    .action(async (promptArg, options) => {
        let puppeteerHelperInstance;
        try {
            // 1. Prompt for description if not provided
            let prompt = promptArg;
            if (!prompt) {
                console.error('Error: Please provide a prompt description.');
                process.exit(1);
            }

            // 2. Load Sample Data
            let sampleRows: any[] = [];
            if (options.data) {
                const dataPath = path.resolve(options.data);
                if (!fs.existsSync(dataPath)) {
                    console.error(`Error: Data file not found at ${dataPath}`);
                    process.exit(1);
                }

                const content = fs.readFileSync(dataPath, 'utf-8');
                if (dataPath.endsWith('.json')) {
                    const json = JSON.parse(content);
                    sampleRows = Array.isArray(json) ? json : [json];
                } else if (dataPath.endsWith('.csv')) {
                    const parsed = Papa.parse(content, {
                        header: true,
                        skipEmptyLines: true,
                        dynamicTyping: true
                    });
                    if (parsed.data && Array.isArray(parsed.data)) {
                        sampleRows = parsed.data;
                    }
                }

                // Limit to 10 unique rows for the LLM context
                sampleRows = getUniqueRows(sampleRows, 5);
                console.log(`Loaded ${sampleRows.length} sample rows from ${options.data}`);
            }

            // 3. Initialize Core
            const contentResolver = new FileSystemContentResolver();
            const { actionRunner, llmFactory, pluginRegistry, globalContext, puppeteerHelper } = await getConfig({ contentResolver });
            puppeteerHelperInstance = puppeteerHelper;

            // 4. Setup Executor
            const executor = new InMemoryConfigExecutor(
                actionRunner,
                pluginRegistry,
                globalContext.events,
                contentResolver
            );

            // 5. Setup LLMs
            const generatorLlm = llmFactory.create({
                model: options.model,
                thinkingLevel: 'high',
                systemParts: [],
                promptParts: []
            }).getRawClient();

            const judgeLlm = llmFactory.create({
                model: options.model,
                thinkingLevel: 'high',
                systemParts: [],
                promptParts: []
            }).getRawClient();

            // 6. Run Refiner
            console.error('Generating configuration... (this may take a minute)');
            const refiner = new ConfigRefiner(generatorLlm, judgeLlm, executor, { maxRetries: 3 });

            const result = await refiner.run({
                prompt,
                sampleRows,
                partialConfig: {}
            });

            if (!result.success || !result.generated) {
                console.error('Failed to generate configuration:', result.feedback);
                process.exit(1);
            }

            // 7. Save Result
            const config = result.generated;

            if (options.output) {
                fs.writeFileSync(options.output, JSON.stringify(config, null, 2));
                console.error(`\nConfiguration saved to ${options.output}`);
            } else {
                console.log(JSON.stringify(config, null, 2));
            }

            // Cleanup
            if (puppeteerHelperInstance) {
                await puppeteerHelperInstance.close();
            }
            process.exit(0);

        } catch (e: any) {
            console.error(e);
            if (puppeteerHelperInstance) {
                await puppeteerHelperInstance.close();
            }
            process.exit(1);
        }
    });

program.command('schema')
    .description('Print the JSON Schema for the configuration file')
    .action(() => {
        const jsonSchema = z.toJSONSchema(PipelineConfigSchema, {
            unrepresentable: 'any'
        });
        console.log(JSON.stringify(jsonSchema, null, 2));
        process.exit(0);
    });

program.parse();
