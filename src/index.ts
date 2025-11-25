#!/usr/bin/env node
import { Command } from 'commander';
import { runAction } from './actions.js';

const program = new Command();

program
    .name('imagegen')
    .description('Generate images and text from CSV or JSON data using GPT');

program.command('generate')
    .description('Generate content (text and/or images) from data file')
    .argument('<data-file>', 'Path to the CSV or JSON file')
    .argument('[template-files...]', 'Path to the prompt template text files')
    .requiredOption('-o, --output <path>', 'Template path for the output (e.g., "out/{{id}}/result.txt")')
    .option('-c, --concurrency <number>', 'Number of concurrent requests', '10')
    .option('--aspect-ratio <ratio>', 'Aspect ratio for image generation (e.g., "3:2"). If provided, requests image generation.')
    .option('-m, --model <model>', 'Model to use for generation')
    .option('-s, --system <file>', 'Path to the system prompt template text file')
    .option('-S, --schema <file>', 'Path to the JSON Schema file for validation')
    .allowUnknownOption()
    .action(async (dataFilePath, templateFilePaths, options, command) => {
        // Parse dynamic options from process.argv manually
        // We look for --system-prompt-N and --json-schema-N
        const stepOverrides: Record<number, { system?: string, schema?: string }> = {};
        const argv = process.argv;
        
        for (let i = 0; i < argv.length; i++) {
            const arg = argv[i];
            
            // Check for --system-prompt-N
            const sysMatch = arg.match(/^--system-prompt-(\d+)$/);
            if (sysMatch) {
                const index = parseInt(sysMatch[1], 10);
                // The next argument should be the value
                if (i + 1 < argv.length && !argv[i+1].startsWith('-')) {
                    if (!stepOverrides[index]) stepOverrides[index] = {};
                    stepOverrides[index].system = argv[i+1];
                }
            }

            // Check for --json-schema-N
            const schemaMatch = arg.match(/^--json-schema-(\d+)$/);
            if (schemaMatch) {
                const index = parseInt(schemaMatch[1], 10);
                if (i + 1 < argv.length && !argv[i+1].startsWith('-')) {
                    if (!stepOverrides[index]) stepOverrides[index] = {};
                    stepOverrides[index].schema = argv[i+1];
                }
            }
        }

        // Check validation logic
        // If we have overrides, we might be okay without global system, but usually user templates are required.
        const hasOverrides = Object.keys(stepOverrides).length > 0;
        if ((!templateFilePaths || templateFilePaths.length === 0) && !options.system && !hasOverrides) {
            console.error('Error: You must provide either template files or a system prompt.');
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
            stepOverrides
        };

        try {
            await runAction(dataFilePath, templateFilePaths, options.output, actionOptions);
            process.exit(0);
        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    });

program.parse();
