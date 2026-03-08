import { Command, Option } from 'commander';
import { CliPluginAdapter } from './interfaces/CliPluginAdapter.js';

/**
 * Registers CLI flags and parses them into raw config.
 * Flags mirror library config paths exactly.
 */
export class StepRegistry {
    constructor(private adapters: CliPluginAdapter[]) {}

    registerFlags(program: Command) {
        // --- Config File ---
        program.option('--config <file>', 'Path to JSON/YAML config file');

        // --- Global Level ---
        program.option('--model <model>', 'Default model name');
        program.option('--concurrency <number>', 'LLM concurrency (default: 50)', parseInt);
        program.option('--task-concurrency <number>', 'Task concurrency (default: 100)', parseInt);
        program.option('--data-output-path <path>', 'Path to save processed data');
        program.option('--timeout <seconds>', 'Default timeout per step', parseInt);
        program.option('--log-level <level>', 'Log level: debug, info, warn, error, silent');

        // Global output
        program.option('--output-path <path>', 'Template path for output files');
        program.option('--output-mode <mode>', 'Output mode: merge/column/ignore');
        program.option('--output-column <column>', 'Output column name');
        program.option('--output-explode', 'Explode array results');
        program.option('--output-tmp-dir <path>', 'Temp directory');
        program.option('--output-limit <number>', 'Global output limit (caps explosion results)', parseInt);
        program.option('--output-offset <number>', 'Global output offset (skips first N explosion results)', parseInt);

        // Global limits
        program.option('--input-limit <number>', 'Limit input rows', parseInt);
        program.option('--input-offset <number>', 'Offset input rows', parseInt);

        // --- Step Level (1-10) ---
        for (let i = 1; i <= 10; i++) {
            // Model
            program.option(`--${i}-model <model>`, `Model for step ${i}`);
            program.option(`--${i}-prompt <text>`, `Prompt for step ${i}`);
            program.option(`--${i}-system <text>`, `System prompt for step ${i}`);
            program.option(`--${i}-temperature <number>`, `Temperature for step ${i}`, parseFloat);
            program.addOption(new Option(`--${i}-thinking-level <level>`, `Thinking level for step ${i}`).choices(['low', 'medium', 'high']));

            // Output
            program.option(`--${i}-output-path <path>`, `Output path for step ${i}`);
            program.option(`--${i}-output-mode <mode>`, `Output mode for step ${i}`);
            program.option(`--${i}-output-column <column>`, `Output column for step ${i}`);
            program.option(`--${i}-output-explode`, `Explode results for step ${i}`);
            program.option(`--${i}-output-limit <number>`, `Output limit for step ${i}`, parseInt);
            program.option(`--${i}-output-offset <number>`, `Output offset for step ${i}`, parseInt);

            // Other
            program.option(`--${i}-candidates <number>`, `Candidates for step ${i}`, parseInt);
            program.option(`--${i}-aspect-ratio <ratio>`, `Aspect ratio for step ${i}`);
            program.option(`--${i}-timeout <seconds>`, `Timeout for step ${i}`, parseInt);
            program.option(`--${i}-schema <file>`, `JSON Schema for step ${i}`);
            program.option(`--${i}-feedback-loops <number>`, `Feedback loops for step ${i}`, parseInt);

            // Judge & Feedback
            program.option(`--${i}-judge-prompt <text>`, `Judge prompt for step ${i}`);
            program.option(`--${i}-judge-model <model>`, `Judge model for step ${i}`);
            program.option(`--${i}-feedback-prompt <text>`, `Feedback prompt for step ${i}`);
        }

        // Plugin flags
        for (const adapter of this.adapters) {
            adapter.registerOptions(program);
            for (let i = 1; i <= 10; i++) {
                adapter.registerOptionsForStep(program, i);
            }
        }
    }
}
