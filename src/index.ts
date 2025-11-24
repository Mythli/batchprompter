import { Command } from 'commander';
import { runAction } from './actions.js';

const program = new Command();

program
    .name('imagegen')
    .description('Generate images and text from CSV or JSON data using GPT');

program.command('image')
    .description('Generate images from data file')
    .argument('<data-file>', 'Path to the CSV or JSON file')
    .argument('[template-files...]', 'Path to the prompt template text files')
    .requiredOption('-o, --output <path>', 'Template path for the image output (e.g., "out/{{id}}/image.png")')
    .option('-c, --concurrency <number>', 'Number of concurrent requests', '10')
    .option('--aspect-ratio <ratio>', 'Aspect ratio for image generation', '3:2')
    .option('-m, --model <model>', 'Model to use for generation')
    .option('-s, --system <file>', 'Path to the system prompt template text file')
    .action(async (dataFilePath, templateFilePaths, options) => {
        if ((!templateFilePaths || templateFilePaths.length === 0) && !options.system) {
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
            system: options.system
        };

        try {
            await runAction('image', dataFilePath, templateFilePaths, options.output, actionOptions);
            process.exit(0);
        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    });

program.command('text')
    .description('Generate text from data file')
    .argument('<data-file>', 'Path to the CSV or JSON file')
    .argument('[template-files...]', 'Path to the prompt template text files')
    .requiredOption('-o, --output <path>', 'Template path for the text output (e.g., "out/{{id}}/text.txt")')
    .option('-c, --concurrency <number>', 'Number of concurrent requests', '10')
    .option('-m, --model <model>', 'Model to use for generation')
    .option('-s, --system <file>', 'Path to the system prompt template text file')
    .action(async (dataFilePath, templateFilePaths, options) => {
        if ((!templateFilePaths || templateFilePaths.length === 0) && !options.system) {
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
            model: options.model,
            system: options.system
        };

        try {
            await runAction('text', dataFilePath, templateFilePaths, options.output, actionOptions);
            process.exit(0);
        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    });

program.parse();
