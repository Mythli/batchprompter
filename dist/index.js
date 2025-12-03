// 
import { Command } from 'commander';
import 'dotenv/config';
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
    try {
        // Parse configuration using the CLI registry
        const config = await StepRegistry.parseConfig(options, [dataFilePath, ...templateFilePaths], cliRegistry);
        // Get the runner from DI
        const { actionRunner } = await getConfig({ concurrency: config.concurrency });
        // Run
        await actionRunner.run(config);
        process.exit(0);
    }
    catch (e) {
        console.error(e);
        process.exit(1);
    }
});
program.parse();
