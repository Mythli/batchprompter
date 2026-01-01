import { Command } from 'commander';
import 'dotenv/config';
import { z } from 'zod';
import { StepRegistry } from './cli/StepRegistry.js';
import { createDefaultRegistry, getConfig } from './getConfig.js';
import { ServiceCapabilities } from './types.js';
import { FileAdapter } from './adapters/FileAdapter.js';
import { PipelineConfigSchema } from './config/schema.js';
import { FileSystemArtifactHandler } from './cli/handlers/FileSystemArtifactHandler.js';

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
        // Get the runner from DI first to get actual capabilities
        const { actionRunner, puppeteerHelper, config: resolvedConfig, pluginRegistry, globalContext } = await getConfig();
        puppeteerHelperInstance = puppeteerHelper;

        let fileConfig = {};

        // Check if we're using a config file
        if (options.config) {
            const fileAdapter = new FileAdapter();
            fileConfig = await fileAdapter.load(options.config);
        }

        // Parse Config (Merge File + CLI)
        const config = await StepRegistry.parseConfig(fileConfig, options, templateFilePaths, pluginRegistry);

        // Initialize Artifact Handler
        // We use the tmpDir from the parsed runtime config
        new FileSystemArtifactHandler(globalContext.events, config.tmpDir);

        // Update the runtime config with the resolved concurrency values if they weren't in CLI args
        // This ensures ActionRunner uses the correct values (Env > Default) if CLI didn't specify them
        const finalConfig = {
            ...config,
            concurrency: config.concurrency ?? resolvedConfig.GPT_CONCURRENCY,
            taskConcurrency: config.taskConcurrency ?? resolvedConfig.TASK_CONCURRENCY
        };

        // Run
        await actionRunner.run(finalConfig);

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
