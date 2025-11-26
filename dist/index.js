#!/usr/bin/env node
import { Command } from 'commander';
import { runAction } from './actions.js';
const program = new Command();
program
    .name('imagegen')
    .description('Generate images and text from CSV or JSON data using GPT');
const generateCmd = program.command('generate')
    .description('Generate content (text and/or images) from data file')
    .argument('<data-file>', 'Path to the CSV or JSON file')
    .argument('[template-files...]', 'Path to the prompt template files (text, image, audio, or directory)')
    .option('-o, --output <path>', 'Template path for the output (e.g., "out/{{id}}/result.txt")')
    .option('--output-column <column>', 'Column name to write output to in the data file')
    .option('--data-output <path>', 'Path to save the processed data file')
    .option('-c, --concurrency <number>', 'Number of concurrent requests', '20')
    .option('--aspect-ratio <ratio>', 'Aspect ratio for image generation (e.g., "3:2"). If provided, requests image generation.')
    .option('-m, --model <model>', 'Model to use for generation')
    .option('-s, --system <file>', 'Path to the system prompt template text file')
    .option('-S, --schema <file>', 'Path to the JSON Schema file for validation')
    .option('--verify-command <cmd>', 'Shell command to verify output. Use {{file}} as placeholder for the file path.');
// Add explicit options for steps 1-10
for (let i = 1; i <= 10; i++) {
    generateCmd.option(`--system-prompt-${i} <file>`, `System prompt for step ${i}`);
    generateCmd.option(`--json-schema-${i} <file>`, `JSON Schema for step ${i}`);
    generateCmd.option(`--verify-command-${i} <cmd>`, `Verify command for step ${i}`);
    generateCmd.option(`--aspect-ratio-${i} <ratio>`, `Aspect ratio for step ${i}`);
    generateCmd.option(`--output-${i} <path>`, `Output path template for step ${i}`);
    generateCmd.option(`--output-column-${i} <column>`, `Output column for step ${i}`);
}
generateCmd.action(async (dataFilePath, templateFilePaths, options) => {
    const stepOverrides = {};
    // Populate stepOverrides from explicit options
    for (let i = 1; i <= 10; i++) {
        const sys = options[`systemPrompt${i}`];
        const schema = options[`jsonSchema${i}`];
        const verify = options[`verifyCommand${i}`];
        const ar = options[`aspectRatio${i}`];
        const out = options[`output${i}`];
        const col = options[`outputColumn${i}`];
        if (sys || schema || verify || ar || out || col) {
            stepOverrides[i] = {};
            if (sys)
                stepOverrides[i].system = sys;
            if (schema)
                stepOverrides[i].schema = schema;
            if (verify)
                stepOverrides[i].verifyCommand = verify;
            if (ar)
                stepOverrides[i].aspectRatio = ar;
            if (out)
                stepOverrides[i].outputTemplate = out;
            if (col)
                stepOverrides[i].outputColumn = col;
        }
    }
    // Validation
    const hasOverrides = Object.keys(stepOverrides).length > 0;
    if ((!templateFilePaths || templateFilePaths.length === 0) && !options.system && !hasOverrides) {
        console.error('Error: You must provide either template files or a system prompt.');
        process.exit(1);
    }
    if (!options.output && !options.outputColumn && !Object.values(stepOverrides).some((o) => o.outputTemplate || o.outputColumn)) {
        console.error('Error: You must provide an output method (file path or column) globally or for specific steps.');
        process.exit(1);
    }
    const concurrency = parseInt(options.concurrency, 10);
    if (isNaN(concurrency) || concurrency < 1) {
        console.error('Error: Concurrency must be a positive number.');
        process.exit(1);
    }
    const actionOptions = {
        concurrency,
        aspectRatio: options.aspectRatio,
        model: options.model,
        system: options.system,
        schema: options.schema,
        verifyCommand: options.verifyCommand,
        outputColumn: options.outputColumn,
        dataOutput: options.dataOutput,
        stepOverrides
    };
    try {
        await runAction(dataFilePath, templateFilePaths, options.output, actionOptions);
        process.exit(0);
    }
    catch (e) {
        console.error(e);
        process.exit(1);
    }
});
program.parse();
