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
    .argument('[template-files...]', 'Path to the prompt template files (text, image, audio, or directory)')
    .requiredOption('-o, --output <path>', 'Template path for the output (e.g., "out/{{id}}/result.txt")')
    .option('-c, --concurrency <number>', 'Number of concurrent requests', '10')
    .option('--aspect-ratio <ratio>', 'Aspect ratio for image generation (e.g., "3:2"). If provided, requests image generation.')
    .option('-m, --model <model>', 'Model to use for generation')
    .option('-s, --system <file>', 'Path to the system prompt template text file')
    .option('-S, --schema <file>', 'Path to the JSON Schema file for validation')
    .option('--verify-command <cmd>', 'Shell command to verify output. Use {{file}} as placeholder for the file path.')
    .allowUnknownOption()
    .action(async (dataFilePath, templateFilePaths, options, command) => {
        // Parse dynamic options from process.argv manually
        // We look for --system-prompt-N, --json-schema-N, --verify-command-N, and --aspect-ratio-N
        const stepOverrides: Record<number, { system?: string, schema?: string, verifyCommand?: string, aspectRatio?: string }> = {};
        const argv = process.argv;

        const dynamicArgs = [
            { prefix: '--system-prompt-', key: 'system' },
            { prefix: '--json-schema-', key: 'schema' },
            { prefix: '--verify-command-', key: 'verifyCommand' },
            { prefix: '--aspect-ratio-', key: 'aspectRatio' }
        ] as const;
        
        for (let i = 0; i < argv.length; i++) {
            const arg = argv[i];
            
            for (const { prefix, key } of dynamicArgs) {
                if (arg.startsWith(prefix)) {
                    const suffix = arg.slice(prefix.length);
                    if (/^\d+$/.test(suffix)) {
                        const index = parseInt(suffix, 10);
                        // The next argument should be the value
                        if (i + 1 < argv.length && !argv[i+1].startsWith('-')) {
                            if (!stepOverrides[index]) stepOverrides[index] = {};
                            // @ts-ignore
                            stepOverrides[index][key] = argv[i+1];
                        }
                    }
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
            verifyCommand: options.verifyCommand,
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
