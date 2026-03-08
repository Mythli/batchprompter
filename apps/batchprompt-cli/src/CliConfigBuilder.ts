import { CliPluginAdapter } from './interfaces/CliPluginAdapter.js';

/**
 * Builds a raw config object by deep-merging file config with CLI flag values.
 * Places values at the exact paths where the library expects them.
 * Zero transformation — just placement.
 */
export class CliConfigBuilder {
    static build(
        fileConfig: any,
        options: Record<string, any>,
        args: string[],
        adapters: CliPluginAdapter[]
    ): any {
        const config = JSON.parse(JSON.stringify(fileConfig || {})); // Deep clone

        // Ensure basic structure exists
        config.steps = config.steps || [];

        // --- Global Overrides ---
        if (options.model) config.model = options.model;
        if (options.concurrency) config.concurrency = parseInt(String(options.concurrency), 10);
        if (options.taskConcurrency) config.taskConcurrency = parseInt(String(options.taskConcurrency), 10);
        if (options.dataOutputPath) config.dataOutputPath = options.dataOutputPath;
        if (options.timeout) config.timeout = parseInt(String(options.timeout), 10);
        
        config.logLevel = options.logLevel || config.logLevel || process.env.BATCHPROMPT_LOG_LEVEL || process.env.LOG_LEVEL || 'info';

        // Global output
        if (options.outputPath || options.outputMode || options.outputColumn || options.outputExplode || options.outputTmpDir || options.outputLimit !== undefined || options.outputOffset !== undefined) {
            config.output = config.output || {};
            if (options.outputPath) config.output.path = options.outputPath;
            if (options.outputMode) config.output.mode = options.outputMode;
            if (options.outputColumn) config.output.column = options.outputColumn;
            if (options.outputExplode) config.output.explode = true;
            if (options.outputTmpDir) config.output.tmpDir = options.outputTmpDir;
            if (options.outputLimit !== undefined) config.output.limit = parseInt(String(options.outputLimit), 10);
            if (options.outputOffset !== undefined) config.output.offset = parseInt(String(options.outputOffset), 10);
        }

        // Global limits
        if (options.inputLimit !== undefined) config.inputLimit = parseInt(String(options.inputLimit), 10);
        if (options.inputOffset !== undefined) config.inputOffset = parseInt(String(options.inputOffset), 10);

        // --- Step Overrides ---
        let maxStepIndex = config.steps.length;

        if (args.length > maxStepIndex) maxStepIndex = args.length;

        // Detect step indices from option keys (e.g., "1Prompt", "2Model")
        Object.keys(options).forEach(key => {
            const match = key.match(/^(\d+)/);
            if (match) {
                const stepNum = parseInt(match[1], 10);
                if (stepNum > maxStepIndex) maxStepIndex = stepNum;
            }
        });

        // Ensure steps array is large enough
        for (let i = 0; i < maxStepIndex; i++) {
            if (!config.steps[i]) {
                config.steps[i] = {};
            }
        }

        for (let i = 0; i < maxStepIndex; i++) {
            const stepNum = i + 1;
            const step = config.steps[i];

            // Positional args → step model prompt
            if (args[i]) {
                step.model = step.model || {};
                step.model.prompt = args[i];
            }

            // Step model config
            if (options[`${stepNum}Model`]) {
                step.model = step.model || {};
                step.model.model = options[`${stepNum}Model`];
            }
            if (options[`${stepNum}Prompt`]) {
                step.model = step.model || {};
                step.model.prompt = options[`${stepNum}Prompt`];
            }
            if (options[`${stepNum}System`]) {
                step.model = step.model || {};
                step.model.system = options[`${stepNum}System`];
            }
            if (options[`${stepNum}Temperature`] !== undefined) {
                step.model = step.model || {};
                step.model.temperature = parseFloat(String(options[`${stepNum}Temperature`]));
            }
            if (options[`${stepNum}ThinkingLevel`]) {
                step.model = step.model || {};
                step.model.thinkingLevel = options[`${stepNum}ThinkingLevel`];
            }

            // Step output config
            if (options[`${stepNum}OutputPath`]) {
                step.output = step.output || {};
                step.output.path = options[`${stepNum}OutputPath`];
            }
            if (options[`${stepNum}OutputMode`]) {
                step.output = step.output || {};
                step.output.mode = options[`${stepNum}OutputMode`];
            }
            if (options[`${stepNum}OutputColumn`]) {
                step.output = step.output || {};
                step.output.mode = 'column';
                step.output.column = options[`${stepNum}OutputColumn`];
            }
            if (options[`${stepNum}OutputExplode`]) {
                step.output = step.output || {};
                step.output.explode = true;
            }
            if (options[`${stepNum}OutputLimit`] !== undefined) {
                step.output = step.output || {};
                step.output.limit = parseInt(String(options[`${stepNum}OutputLimit`]), 10);
            }
            if (options[`${stepNum}OutputOffset`] !== undefined) {
                step.output = step.output || {};
                step.output.offset = parseInt(String(options[`${stepNum}OutputOffset`]), 10);
            }

            // Other step settings
            if (options[`${stepNum}Candidates`] !== undefined) step.candidates = parseInt(String(options[`${stepNum}Candidates`]), 10);
            if (options[`${stepNum}AspectRatio`]) step.aspectRatio = options[`${stepNum}AspectRatio`];
            if (options[`${stepNum}Timeout`] !== undefined) step.timeout = parseInt(String(options[`${stepNum}Timeout`]), 10);
            if (options[`${stepNum}Schema`]) step.schema = options[`${stepNum}Schema`];
            if (options[`${stepNum}FeedbackLoops`] !== undefined) step.feedbackLoops = parseInt(String(options[`${stepNum}FeedbackLoops`]), 10);

            // Judge
            if (options[`${stepNum}JudgePrompt`] || options[`${stepNum}JudgeModel`]) {
                step.judge = step.judge || {};
                if (options[`${stepNum}JudgePrompt`]) step.judge.prompt = options[`${stepNum}JudgePrompt`];
                if (options[`${stepNum}JudgeModel`]) step.judge.model = options[`${stepNum}JudgeModel`];
            }

            // Feedback
            if (options[`${stepNum}FeedbackPrompt`]) {
                step.feedback = step.feedback || {};
                step.feedback.prompt = options[`${stepNum}FeedbackPrompt`];
            }

            // --- Plugin Overrides via Adapters ---
            step.plugins = step.plugins || [];

            for (const adapter of adapters) {
                const pluginConfig = adapter.parseOptions(options, stepNum);
                if (pluginConfig) {
                    step.plugins.push(pluginConfig);
                }
            }
        }

        return config;
    }
}
