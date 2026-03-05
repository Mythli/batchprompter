#!/usr/bin/env node
import { Command } from 'commander';
import 'dotenv/config';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { Parser, transforms } from 'json2csv';
import YAML from 'yaml';
import {
    ConfigRefiner,
    loadData,
    resolveRawConfig,
    createPipeline,
    createPipelineSchema,
    zJsonSchemaObject
} from 'batchprompt';
import { getDiContainer } from './getDiContainer.js';
import { StepRegistry } from './StepRegistry.js';
import { CliConfigBuilder } from './CliConfigBuilder.js';

// Adapters
import { WebSearchAdapter } from './adapters/WebSearchAdapter.js';
import { ImageSearchAdapter } from './adapters/ImageSearchAdapter.js';
import { WebsiteAgentAdapter } from './adapters/WebsiteAgentAdapter.js';
import { ValidationAdapter } from './adapters/ValidationAdapter.js';
import { DedupeAdapter } from './adapters/DedupeAdapter.js';
import { UrlExpanderAdapter } from './adapters/UrlExpanderAdapter.js';
import { ShellAdapter } from './adapters/ShellAdapter.js';
import { LogoScraperAdapter } from './adapters/LogoScraperAdapter.js';
import { StyleScraperAdapter } from './adapters/StyleScraperAdapter.js';
import { LoadDataAdapter } from './adapters/LoadDataAdapter.js';
import { GmailSenderAdapter } from './adapters/GmailSenderAdapter.js';

const program = new Command();

program
    .name('batchprompt')
    .description('Generate images and text from CSV or JSON data using AI');

// --- Adapters ---
const adapters = [
    new WebSearchAdapter(),
    new ImageSearchAdapter(),
    new WebsiteAgentAdapter(),
    new ValidationAdapter(),
    new DedupeAdapter(),
    new UrlExpanderAdapter(),
    new ShellAdapter(),
    new LogoScraperAdapter(),
    new StyleScraperAdapter(),
    new LoadDataAdapter(),
    new GmailSenderAdapter()
];

// --- Generate Command ---
const generateCmd = program.command('generate')
    .description('Generate content from data piped via stdin')
    .argument('[prompts...]', 'Prompt text for each step');

const stepRegistry = new StepRegistry(adapters);
stepRegistry.registerFlags(generateCmd);

generateCmd.action(async (prompts, options) => {
    let puppeteerHelperInstance;
    try {
        const cliDeps = await getDiContainer();
        puppeteerHelperInstance = cliDeps.puppeteerHelper;

        // 1. Load file config
        let fileConfig = {};
        if (options.config) {
            const content = fs.readFileSync(options.config, 'utf-8');
            try {
                fileConfig = JSON.parse(content);
            } catch {
                fileConfig = YAML.parse(content);
            }
        }

        // 2. Load stdin data
        const stdinData = await loadData();

        // 3. Build raw config from file + CLI flags
        const rawConfig = CliConfigBuilder.build(fileConfig, options, prompts, adapters);

        // 4. Inject stdin data
        if (stdinData && stdinData.length > 0) {
            rawConfig.data = stdinData;
        }

        // 5. Extract CLI-only fields
        const dataOutputPath = rawConfig.dataOutputPath;

        // 6. Resolve (IO + validation)
        const globalConfig = await resolveRawConfig(rawConfig, {
            contentResolver: cliDeps.contentResolver,
            pluginRegistry: cliDeps.pluginRegistry
        });

        // 7. Run pipeline
        const pipeline = createPipeline(cliDeps, globalConfig);
        const { results, artifacts } = await pipeline.run();

        // Wait for all artifacts to finish saving to disk
        await cliDeps.artifactHandler.waitForSaves();

        // 8. Write output
        if (dataOutputPath && results.length > 0) {
            const outDir = path.dirname(dataOutputPath);
            if (!fs.existsSync(outDir)) {
                fs.mkdirSync(outDir, { recursive: true });
            }

            if (dataOutputPath.endsWith('.json')) {
                fs.writeFileSync(dataOutputPath, JSON.stringify(results, null, 2));
            } else {
                const parser = new Parser({
                    transforms: [
                        transforms.flatten({ objects: true, arrays: false, separator: '.' })
                    ]
                });
                const csv = parser.parse(results);
                fs.writeFileSync(dataOutputPath, csv);
            }
            console.log(`\nData written to ${dataOutputPath}`);
        }

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

// --- Init Command ---
program.command('init')
    .description('Initialize a new configuration file using AI')
    .argument('[prompt]', 'Description of what you want to do')
    .option('-d, --data <file>', 'Path to sample data file (CSV/JSON)')
    .option('-o, --output <file>', 'Output file path')
    .option('--model <model>', 'Model to use', 'google/gemini-3-flash-preview')
    .action(async (promptArg, options) => {
        let puppeteerHelperInstance;
        try {
            if (!promptArg) {
                console.error('Error: Please provide a prompt description.');
                process.exit(1);
            }

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
                    // Simple CSV parsing
                    const { default: Papa } = await import('papaparse');
                    const parsed = Papa.parse(content, {
                        header: true,
                        skipEmptyLines: true,
                        dynamicTyping: true
                    });
                    if (parsed.data && Array.isArray(parsed.data)) {
                        sampleRows = parsed.data;
                    }
                }

                const { getUniqueRows } = await import('batchprompt');
                sampleRows = getUniqueRows(sampleRows, 5);
                console.log(`Loaded ${sampleRows.length} sample rows from ${options.data}`);
            }

            const cliDeps = await getDiContainer();
            puppeteerHelperInstance = cliDeps.puppeteerHelper;

            // Create LLM clients for the refiner
            const generatorLlm = cliDeps.llmFactory.create(
                { model: options.model, temperature: undefined, reasoning_effort: 'high' as const, messages: [] },
                []
            ).getRawClient();

            const judgeLlm = cliDeps.llmFactory.create(
                { model: options.model, temperature: undefined, reasoning_effort: 'high' as const, messages: [] },
                []
            ).getRawClient();

            // Create executor that runs configs through the pipeline
            const executor = {
                async runConfig(config: any, initialRows?: any[]) {
                    const configWithData = { ...config };
                    if (initialRows && initialRows.length > 0) {
                        configWithData.data = initialRows;
                    }
                    const globalConfig = await resolveRawConfig(configWithData, {
                        contentResolver: cliDeps.contentResolver,
                        pluginRegistry: cliDeps.pluginRegistry
                    });
                    const pipeline = createPipeline(cliDeps, globalConfig);
                    return pipeline.run();
                }
            };

            console.error('Generating configuration... (this may take a minute)');
            const refiner = new ConfigRefiner(generatorLlm, judgeLlm, executor, { maxRetries: 3 });

            const result = await refiner.run({
                prompt: promptArg,
                sampleRows,
                partialConfig: {}
            });

            if (!result.success || !result.generated) {
                console.error('Failed to generate configuration:', result.feedback);
                process.exit(1);
            }

            if (options.output) {
                fs.writeFileSync(options.output, JSON.stringify(result.generated, null, 2));
                console.error(`\nConfiguration saved to ${options.output}`);
            } else {
                console.log(JSON.stringify(result.generated, null, 2));
            }

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

// --- Schema Command ---
program.command('schema')
    .description('Print the JSON Schema for the configuration file')
    .action(async () => {
        try {
            const cliDeps = await getDiContainer();

            const pipelineSchema = createPipelineSchema(cliDeps.pluginRegistry);
            const jsonSchema = z.toJSONSchema(pipelineSchema, {
                unrepresentable: 'any'
            });
            console.log(JSON.stringify(jsonSchema, null, 2));

            await cliDeps.puppeteerHelper.close();
            process.exit(0);
        } catch (e: any) {
            console.error(e);
            process.exit(1);
        }
    });

program.parse();
