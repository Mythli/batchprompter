import { z } from 'zod';
import { 
    ModelDefinition, 
    StepDefinition, 
    NormalizedConfig, 
    PluginConfigDefinition,
    LoosePipelineConfigSchema
} from 'batchprompt';
import { CliPluginAdapter } from './interfaces/CliPluginAdapter.js';

/**
 * Merges CLI options into the file configuration.
 * CLI options take precedence.
 */
function mergeCliOverrides(fileConfig: any, options: Record<string, any>, args: string[], adapters: CliPluginAdapter[]): any {
    const config = JSON.parse(JSON.stringify(fileConfig || {})); // Deep clone

    // Ensure basic structure exists
    config.data = config.data || {};
    config.globals = config.globals || {};
    config.steps = config.steps || [];

    // --- Global Overrides ---
    if (options.model) config.globals.model = options.model;
    if (options.temperature !== undefined) config.globals.temperature = parseFloat(String(options.temperature));
    if (options.thinkingLevel) config.globals.thinkingLevel = options.thinkingLevel;
    if (options.concurrency) config.globals.concurrency = parseInt(String(options.concurrency), 10);
    if (options.taskConcurrency) config.globals.taskConcurrency = parseInt(String(options.taskConcurrency), 10);
    if (options.tmpDir) config.globals.tmpDir = options.tmpDir;
    if (options.output) config.globals.outputPath = options.output;
    if (options.dataOutput) config.globals.dataOutputPath = options.dataOutput;
    if (options.timeout) config.globals.timeout = parseInt(String(options.timeout), 10);

    // --- Limit & Offset Overrides ---
    if (options.inputLimit !== undefined) config.globals.inputLimit = parseInt(String(options.inputLimit), 10);
    if (options.inputOffset !== undefined) config.globals.inputOffset = parseInt(String(options.inputOffset), 10);
    if (options.limit !== undefined) config.globals.limit = parseInt(String(options.limit), 10);
    if (options.offset !== undefined) config.globals.offset = parseInt(String(options.offset), 10);

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

        if (args[i]) {
            step.prompt = args[i];
        }

        // Model Config
        step.model = step.model || {};
        if (options[`model${stepNum}`]) step.model.model = options[`model${stepNum}`];
        if (options[`temperature${stepNum}`] !== undefined) step.model.temperature = parseFloat(String(options[`temperature${stepNum}`]));
        if (options[`thinkingLevel${stepNum}`]) step.model.thinkingLevel = options[`thinkingLevel${stepNum}`];
        if (options[`system${stepNum}`]) step.system = options[`system${stepNum}`];
        if (options[`prompt${stepNum}`]) step.prompt = options[`prompt${stepNum}`];

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

// =============================================================================
// Main Schema Logic
// =============================================================================

export const createConfigSchema = (adapters: CliPluginAdapter[]) => z.object({
    fileConfig: z.any(),
    options: z.record(z.string(), z.any()),
    args: z.array(z.string())
}).transform((input): NormalizedConfig => {
    const { fileConfig, options, args } = input;

    // 1. Merge CLI overrides into file config
    const mergedConfig = mergeCliOverrides(fileConfig, options, args, adapters);

    // 2. Validate against Loose Zod schema (allows strings)
    let config;
    try {
        config = LoosePipelineConfigSchema.parse(mergedConfig);
    } catch (e) {
        console.error('\n\x1b[31m[Config Error] Failed to validate pipeline configuration:\x1b[0m');
        console.error(JSON.stringify(mergedConfig, null, 2));
        throw e;
    }

    // 3. Normalize to internal runtime format
    const steps: StepDefinition[] = [];

    config.steps.forEach((stepDef, index) => {
        const stepIndex = index + 1;

        // Resolve Model Config
        const modelConfig: ModelDefinition = {
            model: stepDef.model?.model ?? config.globals.model,
            temperature: stepDef.model?.temperature ?? config.globals.temperature,
            thinkingLevel: stepDef.model?.thinkingLevel ?? config.globals.thinkingLevel,
            promptSource: stepDef.prompt as any,
            systemSource: stepDef.system as any
        };

        // Apply Global Limits to Step Output
        if (stepDef.output.explode) {
            if (stepDef.output.limit === undefined && config.globals.limit !== undefined) {
                stepDef.output.limit = config.globals.limit;
            }
            if (stepDef.output.offset === undefined && config.globals.offset !== undefined) {
                stepDef.output.offset = config.globals.offset;
            }
        }

        // Resolve Plugins
        const plugins: PluginConfigDefinition[] = [];
        stepDef.plugins.forEach((pluginConfig, pIdx) => {
            // Find the adapter for this plugin type to get the schema
            const adapter = adapters.find(a => a.plugin.type === pluginConfig.type);
            
            if (adapter) {
                try {
                    const validatedConfig = adapter.plugin.configSchema.parse(pluginConfig);

                    // Apply Global Limits to Plugin Output
                    if (validatedConfig.output.explode) {
                        if (validatedConfig.output.limit === undefined && config.globals.limit !== undefined) {
                            validatedConfig.output.limit = config.globals.limit;
                        }
                        if (validatedConfig.output.offset === undefined && config.globals.offset !== undefined) {
                            validatedConfig.output.offset = config.globals.offset;
                        }
                    }

                    plugins.push({
                        name: pluginConfig.type,
                        config: validatedConfig,
                        output: validatedConfig.output
                    });
                } catch (e) {
                    console.error(`\n\x1b[31m[Config Error] Failed to validate plugin '${pluginConfig.type}' at step ${stepIndex}, plugin index ${pIdx}:\x1b[0m`);
                    console.error(JSON.stringify(pluginConfig, null, 2));
                    throw e;
                }
            } else {
                // If no adapter found (e.g. core plugin without CLI adapter?), try to find in registry if we had access
                // But here we rely on adapters list.
                // If it's a valid plugin in config but no adapter, we might skip validation here?
                // Or we should have passed registry.
                // For now, assume all plugins have adapters or we skip validation.
                // Actually, we should probably just push it if it's in the config file.
                plugins.push({
                    name: pluginConfig.type,
                    config: pluginConfig,
                    output: pluginConfig.output
                });
            }
        });

        // Resolve Preprocessors
        const preprocessors: any[] = [];
        stepDef.preprocessors.forEach(ppConfig => {
             preprocessors.push({
                 name: ppConfig.type,
                 config: ppConfig
             });
        });

        steps.push({
            stepIndex,
            modelConfig,
            outputPath: stepDef.outputPath,
            outputTemplate: stepDef.outputPath ?? config.globals.outputPath,

            output: stepDef.output,

            schemaPath: typeof stepDef.schema === 'string' ? stepDef.schema : undefined,
            jsonSchema: typeof stepDef.schema === 'object' ? stepDef.schema : undefined,

            candidates: stepDef.candidates,
            noCandidateCommand: false, // Removed
            judge: stepDef.judge ? {
                model: stepDef.judge.model,
                promptSource: stepDef.judge.prompt as any,
                systemSource: stepDef.judge.system as any
            } : undefined,
            feedback: stepDef.feedback ? {
                model: stepDef.feedback.model,
                promptSource: stepDef.feedback.prompt as any,
                systemSource: stepDef.feedback.system as any
            } : undefined,
            feedbackLoops: stepDef.feedback?.loops || 0,
            aspectRatio: stepDef.aspectRatio,
            plugins,
            preprocessors,
            timeout: stepDef.timeout || config.globals.timeout
        });
    });

    return {
        global: config.globals,
        steps,
        data: {
            format: config.data.format,
            offset: config.data.offset,
            limit: config.data.limit,
            rows: config.data.rows
        }
    };
});
