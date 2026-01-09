import { z } from 'zod';
import os from 'os';
import path from 'path';
import {
    PromptSchema,
    RawModelConfigSchema,
    OutputConfigSchema,
    transformModelConfig
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
// Step Base Schema (No Plugins)
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
    // Shortcuts that might be used by plugins but exist on step level for convenience
    schema: z.any().optional(),
    expandUrls: z.union([z.boolean(), z.record(z.string(), z.any())]).optional()
});

export type StepBaseConfig = z.infer<typeof StepBaseSchema>;

// =============================================================================
// Pipeline Schema Factory
// =============================================================================

/**
 * Creates a factory function that produces the Pipeline Schema.
 * This allows dependency injection of the PluginRegistry.
 */
export const createPipelineSchemaFactory = (pluginRegistry: PluginRegistryV2) => {

    // 1. Stage 1: Globals Analysis Schema
    // Parses only globals, passes everything else through
    const Stage1Schema = GlobalsConfigSchema.loose();

    // 2. Stage 2: Step Context Analysis Schema Builder
    // Creates a schema that resolves Step Base configs by merging them with Globals
    const createStage2Schema = (globals: GlobalsConfig) => {
        const globalModelDefaults = {
            model: globals.model,
            temperature: globals.temperature,
            thinkingLevel: globals.thinkingLevel
        };

        // A Step schema that merges global defaults into itself during transform
        const ContextAwareStepSchema = StepBaseSchema.extend({
            plugins: z.array(z.record(z.string(), z.any())).default([])
        }).transform(step => {
            const rawStepModel = step.model || {};

            // Merge logic: Step > Global
            const mergedStepModelConfig = {
                model: rawStepModel.model ?? globalModelDefaults.model,
                temperature: rawStepModel.temperature ?? globalModelDefaults.temperature,
                thinkingLevel: rawStepModel.thinkingLevel ?? globalModelDefaults.thinkingLevel,
                system: rawStepModel.system ?? step.system,
                prompt: rawStepModel.prompt ?? step.prompt
            };

            // We return the step with the merged model config.
            // Note: We do NOT resolve to messages yet, as plugins need the raw config for their own inheritance.
            // The final resolution happens in the plugin schema or the final step transform.
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

        // Get the context-aware schema from the plugin
        // This schema handles its own defaults and transformations
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
    return async (rawInput: unknown) => {
        // --- Stage 1: Parse Globals ---
        const globals = await Stage1Schema.parseAsync(rawInput);

        // --- Stage 2: Parse Step Contexts ---
        const Stage2Schema = createStage2Schema(globals);
        const context = await Stage2Schema.parseAsync(rawInput);

        // --- Stage 3: Build Final Composite Schema ---

        // Map over the resolved steps to build specific schemas for each
        const stepSchemas = context.steps.map((stepContext, stepIndex) => {

            // A. Build schemas for the plugins in this step
            // We use the raw plugins from the input (via context) to determine types
            const pluginSchemas = stepContext.plugins.map((rawPlugin) => {
                return buildPluginSchema(rawPlugin.type, stepContext, globals);
            });

            const PluginsTuple = z.tuple(pluginSchemas as any);

            // B. Build the Final Step Schema
            // This schema validates the plugins tuple and finalizes the step config
            return StepBaseSchema.extend({
                plugins: PluginsTuple
            }).transform(step => {
                // Finalize Step Model (Prompt -> Messages)
                // The stepContext.model we have here is already merged with globals from Stage 2
                const resolvedModel = transformModelConfig(stepContext.model!);

                // Resolve Judge & Feedback
                let resolvedJudge;
                if (step.judge) {
                    resolvedJudge = transformModelConfig({
                        model: step.judge.model ?? stepContext.model!.model,
                        temperature: step.judge.temperature ?? stepContext.model!.temperature,
                        thinkingLevel: step.judge.thinkingLevel ?? stepContext.model!.thinkingLevel,
                        system: step.judge.system,
                        prompt: step.judge.prompt
                    });
                }

                let resolvedFeedback;
                if (step.feedback) {
                    const fbConfig = transformModelConfig({
                        model: step.feedback.model ?? stepContext.model!.model,
                        temperature: step.feedback.temperature ?? stepContext.model!.temperature,
                        thinkingLevel: step.feedback.thinkingLevel ?? stepContext.model!.thinkingLevel,
                        system: step.feedback.system,
                        prompt: step.feedback.prompt
                    });
                    resolvedFeedback = { ...fbConfig, loops: step.feedback.loops };
                }

                const outputPathTemplate = step.outputPath ?? globals.outputPath;
                const timeout = step.timeout ?? globals.timeout;

                return {
                    // Base properties
                    output: step.output,
                    outputPath: outputPathTemplate,
                    outputTemplate: outputPathTemplate,
                    timeout,
                    tmpDir: globals.tmpDir,
                    candidates: step.candidates,
                    aspectRatio: step.aspectRatio,

                    // Resolved Components
                    model: resolvedModel,
                    judge: resolvedJudge,
                    feedback: resolvedFeedback,
                    plugins: step.plugins, // These are now fully resolved by PluginsTuple

                    // Original raw config for reference
                    rawConfig: step
                };
            });
        });

        const StepsTuple = z.tuple(stepSchemas as any);

        // Return the Final Schema
        return GlobalsConfigSchema.extend({
            steps: StepsTuple
        });
    };
};
