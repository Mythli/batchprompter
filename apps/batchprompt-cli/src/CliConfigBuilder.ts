import { CliPluginAdapter } from './interfaces/CliPluginAdapter.js';

export class CliConfigBuilder {
    static build(
        fileConfig: any,
        options: Record<string, any>,
        args: string[],
        adapters: CliPluginAdapter[]
    ): any {
        const config = JSON.parse(JSON.stringify(fileConfig || {})); // Deep clone

        // Ensure basic structure exists
        config.data = config.data || {};
        config.steps = config.steps || [];

        // --- Global Overrides (Flat) ---
        if (options.model) config.model = options.model;
        if (options.temperature !== undefined) config.temperature = parseFloat(String(options.temperature));
        if (options.thinkingLevel) config.thinkingLevel = options.thinkingLevel;
        if (options.concurrency) config.concurrency = parseInt(String(options.concurrency), 10);
        if (options.taskConcurrency) config.taskConcurrency = parseInt(String(options.taskConcurrency), 10);
        if (options.tmpDir) config.tmpDir = options.tmpDir;
        if (options.output) config.outputPath = options.output;
        if (options.dataOutput) config.dataOutputPath = options.dataOutput;
        if (options.timeout) config.timeout = parseInt(String(options.timeout), 10);

        // --- Limit & Offset Overrides ---
        if (options.inputLimit !== undefined) config.inputLimit = parseInt(String(options.inputLimit), 10);
        if (options.inputOffset !== undefined) config.inputOffset = parseInt(String(options.inputOffset), 10);
        if (options.limit !== undefined) config.limit = parseInt(String(options.limit), 10);
        if (options.offset !== undefined) config.offset = parseInt(String(options.offset), 10);

        // --- Step Overrides ---
        let maxStepIndex = config.steps.length;

        if (args.length > maxStepIndex) maxStepIndex = args.length;

        Object.keys(options).forEach(key => {
            const match = key.match(/(\d+)(?:[A-Z]|$)/);
            if (match) {
                const stepNum = parseInt(match[1], 10);
                if (stepNum > maxStepIndex) maxStepIndex = stepNum;
            }
        });

        for (let i = 0; i < maxStepIndex; i++) {
            if (!config.steps[i]) {
                config.steps[i] = {};
            }
        }

        for (let i = 0; i < maxStepIndex; i++) {
            const stepNum = i + 1;
            const step = config.steps[i];

            // Ensure model object exists
            step.model = step.model || {};

            if (args[i]) {
                step.model.prompt = args[i];
            }

            // Model Config (Nested)
            if (options[`model${stepNum}`]) step.model.model = options[`model${stepNum}`];
            if (options[`temperature${stepNum}`] !== undefined) step.model.temperature = parseFloat(String(options[`temperature${stepNum}`]));
            if (options[`thinkingLevel${stepNum}`]) step.model.thinkingLevel = options[`thinkingLevel${stepNum}`];
            if (options[`system${stepNum}`]) step.model.system = options[`system${stepNum}`];
            if (options[`prompt${stepNum}`]) step.model.prompt = options[`prompt${stepNum}`];

            // Output Config
            step.output = step.output || {};
            if (options[`output${stepNum}`]) step.outputPath = options[`output${stepNum}`];
            if (options[`outputColumn${stepNum}`]) {
                step.output.mode = 'column';
                step.output.column = options[`outputColumn${stepNum}`];
            }
            if (options[`export${stepNum}`]) step.output.mode = 'merge';
            if (options[`explode${stepNum}`]) step.output.explode = true;

            if (options[`limit${stepNum}`] !== undefined) {
                step.output.limit = parseInt(String(options[`limit${stepNum}`]), 10);
            }
            if (options[`offset${stepNum}`] !== undefined) {
                step.output.offset = parseInt(String(options[`offset${stepNum}`]), 10);
            }

            // Other Step Settings
            if (options[`candidates${stepNum}`] !== undefined) step.candidates = parseInt(String(options[`candidates${stepNum}`]), 10);
            if (options[`aspectRatio${stepNum}`]) step.aspectRatio = options[`aspectRatio${stepNum}`];
            if (options[`timeout${stepNum}`] !== undefined) step.timeout = parseInt(String(options[`timeout${stepNum}`]), 10);
            if (options[`jsonSchema${stepNum}`]) step.schema = options[`jsonSchema${stepNum}`];

            // Judge & Feedback
            if (options[`judge${stepNum}Prompt`]) {
                step.judge = step.judge || {};
                step.judge.prompt = options[`judge${stepNum}Prompt`];
            }
            if (options[`judge${stepNum}Model`]) {
                step.judge = step.judge || {};
                step.judge.model = options[`judge${stepNum}Model`];
            }

            if (options[`feedback${stepNum}Prompt`]) {
                step.feedback = step.feedback || {};
                step.feedback.prompt = options[`feedback${stepNum}Prompt`];
            }
            if (options[`feedbackLoops${stepNum}`] !== undefined) {
                step.feedback = step.feedback || {};
                step.feedback.loops = parseInt(String(options[`feedbackLoops${stepNum}`]), 10);
            }

            // --- Plugin Overrides via Adapters ---
            step.plugins = step.plugins || [];

            for (const adapter of adapters) {
                const pluginConfig = adapter.parseOptions(options, stepNum);
                if (pluginConfig) {
                    step.plugins.push({
                        type: adapter.plugin.type,
                        ...pluginConfig
                    });
                }
            }
        }

        return config;
    }
}
