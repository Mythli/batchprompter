// @ts-nocheck
import { Command } from 'commander';
import 'dotenv/config';
import { runAction } from './actions.js';
import { StepRegistry } from './cli/StepRegistry.js';
const program = new Command();
program
    .name('batchprompt')
    .description('Generate images and text from CSV or JSON data using AI');
const generateCmd = program.command('generate')
    .description('Generate content (text and/or images) from data file')
    .argument('<data-file>', 'Path to the CSV or JSON file')
    .argument('[template-files...]', 'Path to the prompt template files (text, image, audio, or directory)');
// Register all step arguments
StepRegistry.registerStepArgs(generateCmd);
generateCmd.action(async (dataFilePath, templateFilePaths, options) => {
    try {
        // Parse configuration
        const config = await StepRegistry.parseConfig(options, [dataFilePath, ...templateFilePaths]);
        // Run
        await runAction(config);
        process.exit(0);
    }
    catch (e) {
        console.error(e);
        process.exit(1);
    }
});
program.parse();
