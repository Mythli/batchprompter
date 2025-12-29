import { z } from 'zod';
import { ModelDefinition, StepDefinition, NormalizedConfig, PluginConfigDefinition, OutputStrategy } from '../types.js';
import { PluginRegistryV2 } from '../plugins/types.js';
import { PipelineConfigSchema } from '../config/schema.js';
/**
 * Merges CLI options into the file configuration.
 * CLI options take precedence.
 */
function mergeCliOverrides(fileConfig: any, options: Record<string, any>, args: string[], pluginRegistry: PluginRegistryV2): any {
    const config = JSON.parse(JSON.stringify(fileConfig || {})); // Deep clone

    // Ensure basic structure exists
    config.data = config.data || {};
    config.globals = config.globals || {};
    config.steps = config.steps || [];

    // --- Data Overrides ---
    if (options.limit !== undefined) config.data.limit = parseInt(String(options.limit), 10);
    if (options.offset !== undefined) config.data.offset = parseInt(String(options.offset), 10);
    if (options.inputLimit !== undefined) config.data.limit = parseInt(String(options.inputLimit), 10);
    if (options.inputOffset !== undefined) config.data.offset = parseInt(String(options.inputOffset), 10);

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

    // --- Step Overrides ---
    // Determine how many steps we need based on args and options
    let maxStepIndex = config.steps.length;

    // Check args (positional prompts)
    if (args.length > maxStepIndex) maxStepIndex = args.length;

    // Check options for step-specific flags (e.g. --model-2)
    Object.keys(options).forEach(key => {
        const match = key.match(/(\d+)(?:[A-Z]|$)/);
        if (match) {
            const stepNum = parseInt(match[1], 10);
            if (stepNum > maxStepIndex) maxStepIndex = stepNum;
        }
    });

    // Ensure steps array is populated
    for (let i = 0; i < maxStepIndex; i++) {
        if (!config.steps[i]) {
            config.steps[i] = {};
        }
    }

    for (let i = 0; i < maxStepIndex; i++) {
        const stepNum = i + 1;
        const step = config.steps[i];

        // Positional Prompt (args[0] is step 1)
        if (args[i]) {
            // Override existing prompt with CLI argument
            step.prompt = args[i];
        }

        // Model Config
        step.model = step.model || {};
        if (options[`model${stepNum}`]) step.model.model = options[`model${stepNum}`];
        if (options[`temperature${stepNum}`] !== undefined) step.model.temperature = parseFloat(String(options[`temperature${stepNum}`]));
        if (options[`thinkingLevel${stepNum}`]) step.model.thinkingLevel = options[`thinkingLevel${stepNum}`];
        if (options[`system${stepNum}`]) step.system = options[`system${stepNum}`];
        if (options[`prompt${stepNum}`]) step.prompt = options[`prompt${stepNum}`]; // Override prompt flag

        // Output Config
        step.output = step.output || {};
        if (options[`output${stepNum}`]) step.outputPath = options[`output${stepNum}`]; // This is actually top-level in StepConfig, not inside output object
        if (options[`outputColumn${stepNum}`]) {
            step.output.mode = 'column';
            step.output.column = options[`outputColumn${stepNum}`];
        }
        if (options[`export${stepNum}`]) step.output.mode = 'merge';
        if (options[`explode${stepNum}`]) step.output.explode = true;

        // Limits & Offsets (Step Specific)
        if (options[`limit${stepNum}`] !== undefined) step.output.limit = parseInt(String(options[`limit${stepNum}`]), 10);
        if (options[`offset${stepNum}`] !== undefined) step.output.offset = parseInt(String(options[`offset${stepNum}`]), 10);

        // Other Step Settings
        if (options[`candidates${stepNum}`] !== undefined) step.candidates = parseInt(String(options[`candidates${stepNum}`]), 10);
        if (options[`skipCandidateCommand${stepNum}`]) step.skipCandidateCommand = true;
        if (options[`aspectRatio${stepNum}`]) step.aspectRatio = options[`aspectRatio${stepNum}`];
        if (options[`command${stepNum}`]) step.command = options[`command${stepNum}`];
        if (options[`verifyCommand${stepNum}`]) step.verifyCommand = options[`verifyCommand${stepNum}`];
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

        // --- Plugin Overrides ---
        // We iterate through all registered plugins and ask them to parse CLI options for this step.
        // If a plugin returns a config, we add it to the step's plugins list.
        // Note: This appends new plugin configs. It does NOT merge with existing file-based plugin configs
        // because matching them by ID or type is ambiguous (a step can have multiple plugins of the same type).
        // This means CLI flags for plugins generally *add* a plugin instance to the step.

        step.plugins = step.plugins || [];

        for (const plugin of pluginRegistry.getAll()) {
            const pluginConfig = plugin.parseCLIOptions(options, stepNum);
            if (pluginConfig) {
                // Check if we should replace an existing plugin config or append?
                // For simplicity and predictability, CLI flags usually imply "I want to run this plugin".
                // If the file already has it, we might be duplicating.
                // However, without a unique ID in CLI flags, we can't target a specific existing plugin instance.
                // Current behavior in legacy code was to append. We stick to that.
                step.plugins.push(pluginConfig);
            }
        }
    }

    return config;
}

// =============================================================================
// Main Schema Logic
// =============================================================================

export const createConfigSchema = (pluginRegistry: PluginRegistryV2) => z.object({
    fileConfig: z.any(),
    options: z.record(z.string(), z.any()),
    args: z.array(z.string())
}).transform((input): NormalizedConfig => {
    const { fileConfig, options, args } = input;

    // 1. Merge CLI overrides into file config
    const mergedConfig = mergeCliOverrides(fileConfig, options, args, pluginRegistry);

    // 2. Validate against strict Zod schema
    const config = PipelineConfigSchema.parse(mergedConfig);

    // 3. Normalize to internal runtime format
    const steps: StepDefinition[] = [];

    config.steps.forEach((stepDef, index) => {
        const stepIndex = index + 1;

        // Resolve Model Config
        const modelConfig: ModelDefinition = {
            model: stepDef.model?.model ?? config.globals.model,
            temperature: stepDef.model?.temperature ?? config.globals.temperature,
            thinkingLevel: stepDef.model?.thinkingLevel ?? config.globals.thinkingLevel,
            // We pass the raw prompt definition to the resolver.
            // The resolver handles string vs object vs parts.
            // We cast to any here because ModelDefinition expects string | undefined for source,
            // but we are passing the raw Zod output which might be an object.
            // We need to update ModelDefinition in types.ts to allow the object, OR serialize it here?
            // Better: Let's update the PromptResolver to accept the PromptDef object.
            // For now, we'll pass it as 'promptSource' and cast, assuming PromptResolver is updated.
            promptSource: stepDef.prompt as any,
            systemSource: stepDef.system as any
        };

        // Resolve Plugins
        const plugins: PluginConfigDefinition[] = [];
        stepDef.plugins.forEach(pluginConfig => {
            const plugin = pluginRegistry.get(pluginConfig.type);
            if (plugin) {
                // Normalize immediately using the plugin's schema.
                // This applies defaults (e.g. queryCount: 3) and validates types.
                const validatedConfig = plugin.configSchema.parse(pluginConfig);

                plugins.push({
                    name: pluginConfig.type,
                    config: validatedConfig,
                    output: validatedConfig.output // Use the output from the validated config (defaults applied)
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
            outputTemplate: stepDef.outputPath ?? config.globals.outputPath, // Inherit global output path if not set on step

            output: stepDef.output,

            schemaPath: typeof stepDef.schema === 'string' ? stepDef.schema : undefined,
            jsonSchema: typeof stepDef.schema === 'object' ? stepDef.schema : undefined,

            verifyCommand: stepDef.verifyCommand,
            postProcessCommand: stepDef.command,
            candidates: stepDef.candidates,
            noCandidateCommand: stepDef.skipCandidateCommand,
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
            limit: config.data.limit
        }
    };
});
