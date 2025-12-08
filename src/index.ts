// 
import { Command } from 'commander';
import 'dotenv/config';
import fsPromises from 'fs/promises';
import { StepRegistry } from './cli/StepRegistry.js';
import { createDefaultRegistry, getConfig } from './getConfig.js';

const program = new Command();

program
    .name('batchprompt')
    .description('Generate images and text from CSV or JSON data using AI');

const generateCmd = program.command('generate')
    .description('Generate content (text and/or images) from data file')
    .argument('<data-file>', 'Path to the CSV or JSON file')
    .argument('[template-files...]', 'Path to the prompt template files (text, image, audio, or directory)');

// Create a registry for CLI configuration purposes
const cliRegistry = createDefaultRegistry();

// Register all step arguments
StepRegistry.registerStepArgs(generateCmd, cliRegistry);

generateCmd.action(async (dataFilePath, templateFilePaths, options) => {
    let puppeteerHelperInstance;
    try {
        // Parse configuration using the CLI registry
        const config = await StepRegistry.parseConfig(options, [dataFilePath, ...templateFilePaths], cliRegistry);

        // Get the runner from DI
        // Pass CLI overrides if present, otherwise getConfig uses env/defaults
        const { actionRunner, puppeteerHelper, config: resolvedConfig } = await getConfig({ 
            concurrency: config.concurrency 
        });
        puppeteerHelperInstance = puppeteerHelper;

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
        console.error("\n❌ Error:", e.message || e);
        console.log("\n--- Usage Help ---\n");
        generateCmd.outputHelp();
        
        // Cleanup on error
        if (puppeteerHelperInstance) {
            await puppeteerHelperInstance.close();
        }
        process.exit(1);
    }
});

program.parse();
