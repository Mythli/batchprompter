#!/usr/bin/env node
import { Command } from 'commander';
import { runAction } from './actions.js';
import { ActionOptions } from './types.js';

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
    .option('--verify-command <cmd>', 'Shell command to verify output. Use {{file}} as placeholder for the file path.')
    .option('--command <cmd>', 'Shell command to run after generation. Use {{file}} as placeholder.')
    .option('--candidates <number>', 'Number of candidates to generate per step', '1')
    .option('--judge-model <model>', 'Model to use for judging candidates')
    .option('--judge-prompt <text>', 'Custom prompt for the judge')
    .option('--candidate-output <template>', 'Template path for candidate files (e.g. "debug/{{id}}_c{{candidate_index}}.png")')
    .option('--skip-candidate-command', 'Do not run verify/post-process commands on candidates, only on the winner')
    .option('--feedback-loops <number>', 'Number of feedback iterations per candidate', '0')
    .option('--feedback-prompt <text>', 'Prompt for the feedback model')
    .option('--feedback-model <model>', 'Model to use for feedback')
    
    // Image Search Flags
    .option('--image-search-query <text>', 'Raw search query for image search')
    .option('--image-search-prompt <text>', 'Prompt to generate search queries')
    .option('--image-select-prompt <text>', 'Prompt to select the best images')
    .option('--image-search-limit <number>', 'Number of images to fetch per query', '10')
    .option('--image-search-select <number>', 'Number of images to select', '1');

// Add explicit options for steps 1-10
for (let i = 1; i <= 10; i++) {
    generateCmd.option(`--system-prompt-${i} <file>`, `System prompt for step ${i}`);
    generateCmd.option(`--json-schema-${i} <file>`, `JSON Schema for step ${i}`);
    generateCmd.option(`--verify-command-${i} <cmd>`, `Verify command for step ${i}`);
    generateCmd.option(`--command-${i} <cmd>`, `Post-process command for step ${i}`);
    generateCmd.option(`--aspect-ratio-${i} <ratio>`, `Aspect ratio for step ${i}`);
    generateCmd.option(`--output-${i} <path>`, `Output path template for step ${i}`);
    generateCmd.option(`--output-column-${i} <column>`, `Output column for step ${i}`);
    generateCmd.option(`--candidates-${i} <number>`, `Number of candidates for step ${i}`);
    generateCmd.option(`--judge-model-${i} <model>`, `Judge model for step ${i}`);
    generateCmd.option(`--judge-prompt-${i} <text>`, `Judge prompt for step ${i}`);
    generateCmd.option(`--candidate-output-${i} <template>`, `Candidate output template for step ${i}`);
    generateCmd.option(`--skip-candidate-command-${i}`, `Disable candidate commands for step ${i}`);
    generateCmd.option(`--feedback-loops-${i} <number>`, `Feedback loops for step ${i}`);
    generateCmd.option(`--feedback-prompt-${i} <text>`, `Feedback prompt for step ${i}`);
    generateCmd.option(`--feedback-model-${i} <model>`, `Feedback model for step ${i}`);
    
    // Image Search Step Options
    generateCmd.option(`--image-search-query-${i} <text>`, `Search query for step ${i}`);
    generateCmd.option(`--image-search-prompt-${i} <text>`, `Search generation prompt for step ${i}`);
    generateCmd.option(`--image-select-prompt-${i} <text>`, `Selection prompt for step ${i}`);
    generateCmd.option(`--image-search-limit-${i} <number>`, `Search limit for step ${i}`);
    generateCmd.option(`--image-search-select-${i} <number>`, `Selection count for step ${i}`);
}

generateCmd.action(async (dataFilePath, templateFilePaths, options) => {
    const stepOverrides: Record<number, any> = {};

    // Populate stepOverrides from explicit options
    for (let i = 1; i <= 10; i++) {
        const sys = options[`systemPrompt${i}`];
        const schema = options[`jsonSchema${i}`];
        const verify = options[`verifyCommand${i}`];
        const cmd = options[`command${i}`];
        const ar = options[`aspectRatio${i}`];
        const out = options[`output${i}`];
        const col = options[`outputColumn${i}`];
        const cand = options[`candidates${i}`];
        const jModel = options[`judgeModel${i}`];
        const jPrompt = options[`judgePrompt${i}`];
        const candOut = options[`candidateOutput${i}`];
        const skipCandCmd = options[`skipCandidateCommand${i}`];
        const fbLoops = options[`feedbackLoops${i}`];
        const fbPrompt = options[`feedbackPrompt${i}`];
        const fbModel = options[`feedbackModel${i}`];
        
        const isq = options[`imageSearchQuery${i}`];
        const isp = options[`imageSearchPrompt${i}`];
        const isel = options[`imageSelectPrompt${i}`];
        const isl = options[`imageSearchLimit${i}`];
        const iss = options[`imageSearchSelect${i}`];

        if (sys || schema || verify || cmd || ar || out || col || cand || jModel || jPrompt || candOut || skipCandCmd !== undefined || fbLoops || fbPrompt || fbModel || isq || isp || isel || isl || iss) {
            stepOverrides[i] = {};
            if (sys) stepOverrides[i].system = sys;
            if (schema) stepOverrides[i].schema = schema;
            if (verify) stepOverrides[i].verifyCommand = verify;
            if (cmd) stepOverrides[i].postProcessCommand = cmd;
            if (ar) stepOverrides[i].aspectRatio = ar;
            if (out) stepOverrides[i].outputTemplate = out;
            if (col) stepOverrides[i].outputColumn = col;
            if (cand) stepOverrides[i].candidates = parseInt(cand, 10);
            if (jModel) stepOverrides[i].judgeModel = jModel;
            if (jPrompt) stepOverrides[i].judgePrompt = jPrompt;
            if (candOut) stepOverrides[i].candidateOutputTemplate = candOut;
            if (skipCandCmd !== undefined) stepOverrides[i].noCandidateCommand = skipCandCmd;
            if (fbLoops) stepOverrides[i].feedbackLoops = parseInt(fbLoops, 10);
            if (fbPrompt) stepOverrides[i].feedbackPrompt = fbPrompt;
            if (fbModel) stepOverrides[i].feedbackModel = fbModel;
            
            if (isq) stepOverrides[i].imageSearchQuery = isq;
            if (isp) stepOverrides[i].imageSearchPrompt = isp;
            if (isel) stepOverrides[i].imageSelectPrompt = isel;
            if (isl) stepOverrides[i].imageSearchLimit = parseInt(isl, 10);
            if (iss) stepOverrides[i].imageSearchSelect = parseInt(iss, 10);
        }
    }

    // Validation
    const hasOverrides = Object.keys(stepOverrides).length > 0;
    const hasImageSearch = options.imageSearchQuery || options.imageSearchPrompt || Object.values(stepOverrides).some((o: any) => o.imageSearchQuery || o.imageSearchPrompt);
    
    if ((!templateFilePaths || templateFilePaths.length === 0) && !options.system && !hasOverrides && !hasImageSearch) {
        console.error('Error: You must provide either template files, a system prompt, or an image search configuration.');
        process.exit(1);
    }

    if (!options.output && !options.outputColumn && !Object.values(stepOverrides).some((o: any) => o.outputTemplate || o.outputColumn)) {
        console.error('Error: You must provide an output method (file path or column) globally or for specific steps.');
        process.exit(1);
    }

    const concurrency = parseInt(options.concurrency, 10);
    if (isNaN(concurrency) || concurrency < 1) {
        console.error('Error: Concurrency must be a positive number.');
        process.exit(1);
    }

    const actionOptions: ActionOptions = {
        concurrency,
        aspectRatio: options.aspectRatio,
        model: options.model,
        system: options.system,
        schema: options.schema,
        jsonSchema: options.jsonSchema,
        verifyCommand: options.verifyCommand,
        postProcessCommand: options.command,
        outputColumn: options.outputColumn,
        dataOutput: options.dataOutput,
        candidates: options.candidates ? parseInt(options.candidates, 10) : undefined,
        judgeModel: options.judgeModel,
        judgePrompt: options.judgePrompt,
        candidateOutputTemplate: options.candidateOutput,
        noCandidateCommand: options.skipCandidateCommand,
        feedbackLoops: options.feedbackLoops ? parseInt(options.feedbackLoops, 10) : undefined,
        feedbackPrompt: options.feedbackPrompt,
        feedbackModel: options.feedbackModel,
        
        imageSearchQuery: options.imageSearchQuery,
        imageSearchPrompt: options.imageSearchPrompt,
        imageSelectPrompt: options.imageSelectPrompt,
        imageSearchLimit: options.imageSearchLimit ? parseInt(options.imageSearchLimit, 10) : undefined,
        imageSearchSelect: options.imageSearchSelect ? parseInt(options.imageSearchSelect, 10) : undefined,
        
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
