import { Command } from 'commander';
import { PipelineConfig, StepConfig, OutputConfig } from '../config/types.js';
import { PluginRegistryV2 } from '../plugins/types.js';

/**
 * Adapts CLI arguments to the canonical PipelineConfig format.
 * Plugins register their own flags - this adapter just coordinates.
 */
export class CLIAdapter {
    constructor(private pluginRegistry: PluginRegistryV2) {}

    /**
     * Register all CLI options with Commander
     */
    register(program: Command): void {
        // Core options (not owned by any plugin)
        this.registerCoreOptions(program);

        // Let plugins register their own options
        this.pluginRegistry.registerCLI(program);
    }

    private registerCoreOptions(program: Command): void {
        // Data options
        program.option('--config <file>', 'Path to YAML/JSON config file');
        program.option('--offset <number>', 'Start from row index', parseInt);
        program.option('--limit <number>', 'Limit number of rows', parseInt);

        // Global model options
        program.option('--model <model>', 'Default model');
        program.option('--temperature <number>', 'Default temperature', parseFloat);
        program.option('--thinking-level <level>', 'Reasoning effort (low/medium/high)');
        program.option('--system <file>', 'System prompt file or text');
        program.option('-S, --schema <file>', 'JSON Schema for structured output');

        // Execution options
        program.option('-c, --concurrency <number>', 'LLM concurrency', parseInt);
        program.option('--task-concurrency <number>', 'Task concurrency', parseInt);
        program.option('--tmp-dir <path>', 'Temporary directory', '.tmp');
        program.option('--data-output <path>', 'Output data file path');

        // Step output options
        program.option('-o, --output <path>', 'Output file path template');
        program.option('--output-column <column>', 'Column to write output to');
        program.option('--export', 'Merge result into row');
        program.option('--explode', 'Explode array results');

        // Post-processing
        program.option('--command <cmd>', 'Post-process command');
        program.option('--verify-command <cmd>', 'Verification command');

        // Candidates
        program.option('--candidates <number>', 'Number of candidates', parseInt);
        program.option('--skip-candidate-command', 'Skip commands for candidates');

        // Judge
        program.option('--judge-prompt <text>', 'Judge prompt');
        program.option('--judge-model <model>', 'Judge model');
        program.option('--judge-temperature <number>', 'Judge temperature', parseFloat);

        // Feedback
        program.option('--feedback-prompt <text>', 'Feedback prompt');
        program.option('--feedback-model <model>', 'Feedback model');
        program.option('--feedback-loops <number>', 'Feedback loop count', parseInt);

        // Image generation
        program.option('--aspect-ratio <ratio>', 'Image aspect ratio');

        // Step-specific core options (1-10)
        for (let i = 1; i <= 10; i++) {
            program.option(`--model-${i} <model>`, `Model for step ${i}`);
            program.option(`--temperature-${i} <number>`, `Temperature for step ${i}`, parseFloat);
            program.option(`--thinking-level-${i} <level>`, `Thinking level for step ${i}`);
            program.option(`--prompt-${i} <text>`, `Prompt for step ${i}`);
            program.option(`--system-${i} <file>`, `System prompt for step ${i}`);
            program.option(`--output-${i} <path>`, `Output path for step ${i}`);
            program.option(`--output-column-${i} <column>`, `Output column for step ${i}`);
            program.option(`--export-${i}`, `Export for step ${i}`);
            program.option(`--explode-${i}`, `Explode for step ${i}`);
            program.option(`--json-schema-${i} <file>`, `Schema for step ${i}`);
            program.option(`--command-${i} <cmd>`, `Command for step ${i}`);
            program.option(`--verify-command-${i} <cmd>`, `Verify command for step ${i}`);
            program.option(`--candidates-${i} <number>`, `Candidates for step ${i}`, parseInt);
            program.option(`--skip-candidate-command-${i}`, `Skip candidate command for step ${i}`);
            program.option(`--aspect-ratio-${i} <ratio>`, `Aspect ratio for step ${i}`);
            program.option(`--judge-${i}-prompt <text>`, `Judge prompt for step ${i}`);
            program.option(`--judge-${i}-model <model>`, `Judge model for step ${i}`);
            program.option(`--feedback-${i}-prompt <text>`, `Feedback prompt for step ${i}`);
            program.option(`--feedback-${i}-model <model>`, `Feedback model for step ${i}`);
            program.option(`--feedback-loops-${i} <number>`, `Feedback loops for step ${i}`, parseInt);
        }
    }

    /**
     * Parse CLI options and positional arguments into PipelineConfig
     */
    parse(options: Record<string, any>, args: string[]): PipelineConfig {
        const dataFilePath = args[0];
        if (!dataFilePath) {
            throw new Error('Data file path is required');
        }

        // Determine max step from args and options
        let maxStep = Math.max(1, args.length - 1);
        Object.keys(options).forEach(key => {
            const match = key.match(/(\d+)(?:[A-Z]|$)/);
            if (match) {
                const stepNum = parseInt(match[1], 10);
                if (stepNum > maxStep) maxStep = stepNum;
            }
        });

        // Build globals
        const globals = {
            model: options.model,
            temperature: options.temperature,
            thinkingLevel: options.thinkingLevel,
            concurrency: options.concurrency,
            taskConcurrency: options.taskConcurrency,
            tmpDir: options.tmpDir || '.tmp',
            outputPath: options.dataOutput
        };

        // Build steps
        const steps: StepConfig[] = [];

        for (let i = 1; i <= maxStep; i++) {
            const step = this.parseStep(options, args, i);
            steps.push(step);
        }

        return {
            data: {
                source: dataFilePath,
                format: 'auto',
                offset: options.offset,
                limit: options.limit
            },
            globals,
            steps
        };
    }

    private parseStep(options: Record<string, any>, args: string[], stepIndex: number): StepConfig {
        const getOpt = (key: string) => {
            // Try step-specific first, then global
            const stepKey = this.toStepKey(key, stepIndex);
            return options[stepKey] ?? options[key];
        };

        // Get prompt from positional arg or flag
        const positionalPrompt = args[stepIndex];
        const flagPrompt = getOpt('prompt');
        let prompt: string | undefined;

        if (positionalPrompt && flagPrompt) {
            prompt = `${flagPrompt}\n\n${positionalPrompt}`;
        } else {
            prompt = positionalPrompt || flagPrompt;
        }

        // Parse output config
        const outputColumn = getOpt('outputColumn');
        const exportFlag = getOpt('export');
        const explodeFlag = getOpt('explode');

        let outputMode: 'merge' | 'column' | 'ignore' = 'ignore';
        if (outputColumn) outputMode = 'column';
        else if (exportFlag) outputMode = 'merge';

        const output: OutputConfig = {
            mode: outputMode,
            column: outputColumn,
            explode: explodeFlag ?? false
        };

        // Parse plugins from CLI options
        const plugins: any[] = [];

        for (const plugin of this.pluginRegistry.getAll()) {
            const pluginConfig = plugin.parseCLIOptions(options, stepIndex);
            if (pluginConfig) {
                plugins.push(pluginConfig);
            }
        }

        // Parse judge
        let judge: any;
        const judgePrompt = options[`judge${stepIndex}Prompt`] ?? options.judgePrompt;
        const judgeModel = options[`judge${stepIndex}Model`] ?? options.judgeModel;

        if (judgePrompt) {
            judge = {
                prompt: judgePrompt,
                model: judgeModel
            };
        }

        // Parse feedback
        let feedback: any;
        const feedbackPrompt = options[`feedback${stepIndex}Prompt`] ?? options.feedbackPrompt;
        const feedbackModel = options[`feedback${stepIndex}Model`] ?? options.feedbackModel;
        const feedbackLoops = getOpt('feedbackLoops');

        if (feedbackPrompt || feedbackLoops) {
            feedback = {
                prompt: feedbackPrompt,
                model: feedbackModel,
                loops: feedbackLoops ?? 0
            };
        }

        return {
            prompt,
            system: getOpt('system'),
            model: {
                model: getOpt('model'),
                temperature: getOpt('temperature'),
                thinkingLevel: getOpt('thinkingLevel')
            },
            plugins,
            output,
            schema: getOpt('jsonSchema') || getOpt('schema'),
            candidates: getOpt('candidates') ?? 1,
            skipCandidateCommand: getOpt('skipCandidateCommand') ?? false,
            judge,
            feedback,
            aspectRatio: getOpt('aspectRatio'),
            command: getOpt('command'),
            verifyCommand: getOpt('verifyCommand')
        };
    }

    private toStepKey(key: string, stepIndex: number): string {
        // Convert 'outputColumn' to 'outputColumn1', etc.
        return `${key}${stepIndex}`;
    }
}
