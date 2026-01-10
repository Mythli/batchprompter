import { z } from 'zod';
import os from 'os';
import path from 'path';
import {
    PromptSchema,
    RawModelConfigSchema,
    OutputConfigSchema,
    transformModelConfig,
    mergeModelConfigs,
    resolveModelConfig,
    ModelConfig
} from './schemas/index.js';
import { zHandlebars } from './validationRules.js';
import { PluginRegistryV2 } from '../plugins/types.js';

// =============================================================================
// Re-exports
// =============================================================================

export { PromptSchema as PromptDefSchema, RawModelConfigSchema as ModelConfigSchema, OutputConfigSchema };

// =============================================================================
// Feedback Schema
// =============================================================================

export const FeedbackConfigSchema = RawModelConfigSchema.extend({
    loops: z.number().int().min(0).default(0).describe("Number of feedback iterations to run.")
});

// =============================================================================
// Global Configuration Schema
// =============================================================================

export const GlobalsConfigSchema = z.object({
    model: z.string().default('google/gemini-3-flash-preview'),
    temperature: z.number().min(0).max(2).optional(),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    concurrency: z.number().int().positive().default(50),
    taskConcurrency: z.number().int().positive().default(100),
    tmpDir: zHandlebars.default(path.join(os.tmpdir(), 'batchprompt')),
    outputPath: zHandlebars.optional(),
    dataOutputPath: z.string().optional(),
    timeout: z.number().int().positive().default(180),
    inputLimit: z.number().int().positive().optional(),
    inputOffset: z.number().int().min(0).optional(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().min(0).optional(),
    data: z.array(z.record(z.string(), z.any())).default([{}]),
});

export type GlobalsConfig = z.infer<typeof GlobalsConfigSchema>;

// =============================================================================
// Step Base Schema (Input)
// =============================================================================

export const StepBaseSchema = z.object({
    prompt: PromptSchema.optional(),
    system: PromptSchema.optional(),
    model: RawModelConfigSchema.optional(),
    output: OutputConfigSchema.default({ mode: 'ignore', explode: false }),
    outputPath: zHandlebars.optional(),
    candidates: z.number().int().positive().default(1),
    judge: RawModelConfigSchema.optional(),
    feedback: FeedbackConfigSchema.optional(),
    aspectRatio: z.string().optional(),
    timeout: z.number().int().positive().optional(),
    schema: z.any().optional(),
});

export type StepBaseConfig = z.infer<typeof StepBaseSchema>;

// =============================================================================
// Resolved Plugin Base
// =============================================================================

export const ResolvedPluginBaseSchema = z.object({
    type: z.string(),
    id: z.string(),
    output: OutputConfigSchema,
    config: z.any(),
    instance: z.any() // This is the Plugin<T> instance
});

export type ResolvedPluginBase = z.infer<typeof ResolvedPluginBaseSchema>;

// =============================================================================
// Step Resolution Logic
// =============================================================================

/**
 * Resolves a raw step configuration into its final runtime state.
 * This function is used by the Zod transform to infer the output type.
 *
 * @param step The raw step configuration (with plugins already resolved to objects)
 * @param globals The global configuration
 * @param contextModel The merged model configuration (Global + Step Raw)
 */
export function resolveStep(
    step: StepBaseConfig & { plugins: ResolvedPluginBase[], [key: string]: any },
    globals: GlobalsConfig,
    contextModel: ModelConfig
) {
    // Finalize Step Model (Prompt -> Messages)
    const resolvedModel = transformModelConfig(contextModel);

    // Resolve Judge & Feedback
    const resolvedJudge = step.judge ? resolveModelConfig(step.judge, contextModel) : undefined;

    let resolvedFeedback;
    if (step.feedback) {
        const fbConfig = resolveModelConfig(step.feedback, contextModel);
        resolvedFeedback = { ...fbConfig, loops: step.feedback.loops };
    }

    const outputPathTemplate = step.outputPath ?? globals.outputPath;

    return {
        // Pass-throughs
        ...step,
        timeout: step.timeout ?? globals.timeout,

        // Resolved
        outputPath: outputPathTemplate,
        outputTemplate: outputPathTemplate,
        tmpDir: globals.tmpDir,
        model: resolvedModel,
        judge: resolvedJudge,
        feedback: resolvedFeedback,
    };
}

// =============================================================================
// Inferred Runtime Types
// =============================================================================

export type StepConfig = ReturnType<typeof resolveStep>;
export type ResolvedStepConfig = StepConfig;

export type RuntimeConfig = GlobalsConfig & {
    steps: StepConfig[];
};

export type ResolvedPipelineConfig = RuntimeConfig;

// =============================================================================
// Preprocessing Logic
// =============================================================================

function preprocessConfig(config: any, registry: PluginRegistryV2): any {
    if (!config || typeof config !== 'object') return config;
    const expanded = JSON.parse(JSON.stringify(config));

    if (expanded.steps && Array.isArray(expanded.steps)) {
        const plugins = registry.getAll();
        for (let i = 0; i < expanded.steps.length; i++) {
            let step = expanded.steps[i];
            for (const plugin of plugins) {
                if (plugin.preprocessStep) {
                    step = plugin.preprocessStep(step);
                }
            }
            expanded.steps[i] = step;
        }
    }
    return expanded;
}

// =============================================================================
// Pipeline Schema Factory
// =============================================================================

export const createPipelineSchemaFactory = (pluginRegistry: PluginRegistryV2) => {

    // 0. Extend StepBaseSchema with Plugin Extensions
    let ExtendedStepBaseSchema = StepBaseSchema;
    const plugins = pluginRegistry.getAll();

    for (const plugin of plugins) {
        if (plugin.getStepExtensionSchema) {
            const extension = plugin.getStepExtensionSchema();
            if (extension) {
                ExtendedStepBaseSchema = ExtendedStepBaseSchema.extend(extension as any);
            }
        }
    }

    // 1. Stage 1: Globals Analysis Schema
    const Stage1Schema = GlobalsConfigSchema.loose();

    // 2. Stage 2: Step Context Analysis Schema Builder
    const createStage2Schema = (globals: GlobalsConfig) => {
        const globalModelDefaults = {
            model: globals.model,
            temperature: globals.temperature,
            thinkingLevel: globals.thinkingLevel
        };

        const ContextAwareStepSchema = ExtendedStepBaseSchema.extend({
            plugins: z.array(z.record(z.string(), z.any())).default([])
        }).transform(step => {
            const rawStepModel = step.model || {};

            const mergedStepModelConfig = mergeModelConfigs(rawStepModel, {
                ...globalModelDefaults,
                system: step.system,
                prompt: step.prompt
            });

            return {
                ...step,
                model: mergedStepModelConfig
            };
        });

        return GlobalsConfigSchema.extend({
            steps: z.array(ContextAwareStepSchema).min(1)
        }).loose();
    };

    // 3. Helper to build a specific plugin schema
    const buildPluginSchema = (pluginType: string, stepContext: StepBaseConfig, globals: GlobalsConfig) => {
        const pluginInstance = pluginRegistry.get(pluginType);

        if (!pluginInstance) {
            return z.any().superRefine((val, ctx) => {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Unknown plugin type: '${pluginType}'`,
                    path: ['type']
                });
            });
        }

        return pluginInstance.getSchema(stepContext, globals).transform(async (config) => {
            return {
                type: pluginType,
                id: config.id ?? `${pluginType}-${Date.now()}`,
                output: config.output,
                config: config,
                instance: pluginInstance
            };
        });
    };

    // 4. The Main Schema Creator
    return async (rawInput: unknown): Promise<RuntimeConfig> => {
        // --- Stage 0: Preprocess ---
        const preprocessedInput = preprocessConfig(rawInput, pluginRegistry);

        // --- Stage 1: Parse Globals ---
        const globals = await Stage1Schema.parseAsync(preprocessedInput);

        // --- Stage 2: Parse Step Contexts ---
        const Stage2Schema = createStage2Schema(globals);
        const context = await Stage2Schema.parseAsync(preprocessedInput);

        // --- Stage 3: Build Final Composite Schema ---
        const stepSchemas = context.steps.map((stepContext, stepIndex) => {

            // A. Build schemas for the plugins in this step
            const pluginSchemas = stepContext.plugins.map((rawPlugin: any) => {
                return buildPluginSchema(rawPlugin.type, stepContext, globals);
            });

            const PluginsTuple = z.tuple(pluginSchemas as any);

            // B. Build the Final Step Schema
            return ExtendedStepBaseSchema.extend({
                plugins: PluginsTuple
            }).transform((step): StepConfig => {
                // Use the extracted resolution logic
                // stepContext.model contains the merged model config from Stage 2
                return resolveStep(step as any, globals, stepContext.model!);
            });
        });

        const StepsTuple = z.tuple(stepSchemas as any);

        const FinalSchema = GlobalsConfigSchema.extend({
            steps: StepsTuple
        });

        // We wrap it in z.preprocess to ensure that if this schema is used elsewhere,
        // it still applies the preprocessing logic.
        const PreprocessedSchema = z.preprocess(
            (raw) => preprocessConfig(raw, pluginRegistry),
            FinalSchema
        );

        return PreprocessedSchema.parseAsync(rawInput) as Promise<RuntimeConfig>;
    };
};
