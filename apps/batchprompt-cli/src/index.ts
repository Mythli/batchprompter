#!/usr/bin/env node
import { Command } from 'commander';
import 'dotenv/config';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { Parser, transforms } from 'json2csv';
import {
    createDefaultRegistry,
    ServiceCapabilities,
    DebugLogger,
    ConfigRefiner,
    InMemoryConfigExecutor,
    getUniqueRows,
    WebSearchPluginV2,
    ImageSearchPluginV2,
    WebsiteAgentPluginV2,
    StyleScraperPluginV2,
    ValidationPluginV2,
    DedupePluginV2,
    LogoScraperPluginV2,
    PromptLoader,
    createPipelineSchema,
    zJsonSchemaObject
} from 'batchprompt';
import { getConfig } from './getConfig.js';
import { StepRegistry } from './StepRegistry.js';
import { FileSystemArtifactHandler } from './handlers/FileSystemArtifactHandler.js';
import { FileAdapter } from './io/FileAdapter.js';
import { FileSystemContentResolver } from './io/FileSystemContentResolver.js';
import Papa from 'papaparse';

// Adapters
import { WebSearchAdapter } from './adapters/WebSearchAdapter.js';
import { ImageSearchAdapter } from './adapters/ImageSearchAdapter.js';
import { WebsiteAgentAdapter } from './adapters/WebsiteAgentAdapter.js';
import { StyleScraperAdapter } from './adapters/StyleScraperAdapter.js';
import { ValidationAdapter } from './adapters/ValidationAdapter.js';
import { DedupeAdapter } from './adapters/DedupeAdapter.js';
import { LogoScraperAdapter } from './adapters/LogoScraperAdapter.js';
import { ShellAdapter } from './adapters/ShellAdapter.js';
import { ShellPlugin, ShellConfigSchema } from './plugins/ShellPlugin.js';

const program = new Command();

program
    .name('batchprompt')
    .description('Generate images and text from CSV or JSON data using AI');

const generateCmd = program.command('generate')
    .description('Generate content (text and/or images) from data piped via stdin')
    .argument('[template-files...]', 'Path to the prompt template files (text, image, audio, or directory)');

// Create a registry for CLI configuration purposes only
const cliCapabilities: ServiceCapabilities = {
    hasSerper: true,
    hasPuppeteer: true
};

// Initialize dependencies for CLI registry
const contentResolver = new FileSystemContentResolver();
const promptLoader = new PromptLoader(contentResolver);

const cliRegistry = createDefaultRegistry(cliCapabilities, promptLoader);

// Initialize Plugins and Adapters
const shellPlugin = new ShellPlugin();
const adapters = [
    new WebSearchAdapter(new WebSearchPluginV2(promptLoader)),
    new ImageSearchAdapter(new ImageSearchPluginV2(promptLoader)),
    new WebsiteAgentAdapter(new WebsiteAgentPluginV2(promptLoader)),
    new StyleScraperAdapter(new StyleScraperPluginV2()),
    new ValidationAdapter(new ValidationPluginV2()),
    new DedupeAdapter(new DedupePluginV2()),
    new LogoScraperAdapter(new LogoScraperPluginV2(promptLoader)),
    new ShellAdapter(shellPlugin)
];

// Register all step arguments
const stepRegistry = new StepRegistry(adapters);
stepRegistry.registerStepArgs(generateCmd, cliRegistry);

generateCmd.action(async (templateFilePaths, options) => {
    let puppeteerHelperInstance;
    try {
        const { 
            actionRunner, 
            puppeteerHelper, 
            config: resolvedConfig, 
            pluginRegistry, 
            globalContext
        } = await getConfig();
        
        // Register ShellPlugin in the runtime registry
        pluginRegistry.register(shellPlugin);
        
        puppeteerHelperInstance = puppeteerHelper;

        const config = await stepRegistry.parseConfig(
            options.config, 
            options, 
            templateFilePaths, 
            pluginRegistry
        );

        new FileSystemArtifactHandler(globalContext.events, config.tmpDir);
        new DebugLogger(globalContext.events);

        const results: any[] = [];
        globalContext.events.on('row:end', ({ result }) => {
            results.push(result);
        });

        const finalConfig = {
            ...config,
            concurrency: config.concurrency ?? resolvedConfig.GPT_CONCURRENCY,
            taskConcurrency: config.taskConcurrency ?? resolvedConfig.TASK_CONCURRENCY
        };

        await actionRunner.run(finalConfig);

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

program.command('init')
    .description('Initialize a new configuration file using AI')
    .argument('[prompt]', 'Description of what you want to do')
    .option('-d, --data <file>', 'Path to sample data file (CSV/JSON) to infer schema')
    .option('-o, --output <file>', 'Output file path')
    .option('--model <model>', 'Model to use for generation', 'google/gemini-3-flash-preview')
    .action(async (promptArg, options) => {
        let puppeteerHelperInstance;
        try {
            let prompt = promptArg;
            if (!prompt) {
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
                    const parsed = Papa.parse(content, {
                        header: true,
                        skipEmptyLines: true,
                        dynamicTyping: true
                    });
                    if (parsed.data && Array.isArray(parsed.data)) {
                        sampleRows = parsed.data;
                    }
                }

                sampleRows = getUniqueRows(sampleRows, 5);
                console.log(`Loaded ${sampleRows.length} sample rows from ${options.data}`);
            }

            const { actionRunner, llmFactory, pluginRegistry, globalContext, puppeteerHelper } = await getConfig();
            puppeteerHelperInstance = puppeteerHelper;
            const contentResolver = globalContext.contentResolver;

            const executor = new InMemoryConfigExecutor(
                actionRunner,
                pluginRegistry,
                globalContext.events,
                contentResolver
            );

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

            const config = result.generated;

            if (options.output) {
                fs.writeFileSync(options.output, JSON.stringify(config, null, 2));
                console.error(`\nConfiguration saved to ${options.output}`);
            } else {
                console.log(JSON.stringify(config, null, 2));
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

program.command('schema')
    .description('Print the JSON Schema for the configuration file')
    .action(() => {
        // Get all plugin schemas including CLI-only ShellPlugin
        const allPluginSchemas = [
            ...cliRegistry.getAll().map(p => p.configSchema),
            ShellConfigSchema
        ];
        
        const pluginUnion = allPluginSchemas.length > 0 
            ? z.discriminatedUnion('type', allPluginSchemas as any)
            : z.object({ type: z.string() });
        
        // Allow string or object for schema field (input mode)
        const schemaFieldType = z.union([z.string(), zJsonSchemaObject]);
        
        const schema = createPipelineSchema(pluginUnion, schemaFieldType);
        const jsonSchema = z.toJSONSchema(schema, {
            unrepresentable: 'any'
        });
        console.log(JSON.stringify(jsonSchema, null, 2));
        process.exit(0);
    });

program.parse();
