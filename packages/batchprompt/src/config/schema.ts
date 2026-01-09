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
    offset: z.number().int().min(0).optional()
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
    expandUrls: z.union([z.boolean(), z.record(z.any())]).optional()
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

    // 1. Define the "Loose" Schema
    // This schema validates the structure of Globals and Steps but treats plugins as 'any'.
    // We use this to extract the context (Globals + Step Base) needed to generate the strict plugin schemas.
    const LooseStepSchema = StepBaseSchema.extend({
        plugins: z.array(z.record(z.string(), z.any())).default([])
    });

    const LoosePipelineSchema = GlobalsConfigSchema.extend({
        data: z.array(z.record(z.string(), z.any())).default([{}]),
        steps: z.array(LooseStepSchema).min(1)
    });

    // 2. Internal Helper: Resolve Inheritance
    // Merges Global defaults into the Step configuration to create the context for plugins.
    const resolveStepContext = (step: z.infer<typeof LooseStepSchema>, globals: GlobalsConfig): StepBaseConfig => {
        const globalModelDefaults = {
            model: globals.model,
            temperature: globals.temperature,
            thinkingLevel: globals.thinkingLevel
        };

        const rawStepModel = step.model || {};
        
        // Merge logic: Step > Global
        const mergedStepModelConfig = {
            model: rawStepModel.model ?? globalModelDefaults.model,
            temperature: rawStepModel.temperature ?? globalModelDefaults.temperature,
            thinkingLevel: rawStepModel.thinkingLevel ?? globalModelDefaults.thinkingLevel,
            system: rawStepModel.system ?? step.system,
            prompt: rawStepModel.prompt ?? step.prompt
        };

        return {
            ...step,
            model: mergedStepModelConfig
        };
    };

    // 3. Internal Helper: Build Dynamic Plugin Schema
    // Creates a Zod schema for a specific plugin instance, injected with the resolved context.
    const buildPluginSchema = (pluginType: string, stepContext: StepBaseConfig, globals: GlobalsConfig) => {
        const pluginInstance = pluginRegistry.get(pluginType);
        
        if (!pluginInstance) {
            // We return a schema that always fails, so Zod handles the error reporting
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
                id: config.id ?? `${pluginType}-${Date.now()}`, // Fallback ID if not set by plugin schema
                output: config.output,
                config: config,
                instance: pluginInstance
            };
        });
    };

    // 4. The Main Schema Creator
    return () => {
        return z.any().transform(async (rawInput) => {
            // Pass 1: Parse the loose structure to get Globals and Step Bases
            const looseConfig = await LoosePipelineSchema.parseAsync(rawInput);

            // Pass 2: Build the Strict Schema dynamically based on the loose config
            // We map over the parsed steps to build a specific schema for each step's plugins
            const resolvedSteps = await Promise.all(looseConfig.steps.map(async (step, stepIndex) => {
                
                // A. Calculate Context (Inheritance)
                const stepContext = resolveStepContext(step, looseConfig);

                // B. Build Schemas for THIS step's plugins
                // We iterate the *raw* plugins from the loose parse to know which types to look up
                const pluginSchemas = step.plugins.map((rawPlugin) => {
                    const type = rawPlugin.type;
                    return buildPluginSchema(type, stepContext, looseConfig);
                });

                // C. Create a Tuple Schema for the plugins array
                // We use a tuple because we want to validate each plugin index against its specific generated schema
                // (Since we generated the schemas based on the *order* of plugins in the loose config)
                const PluginsTuple = z.tuple(pluginSchemas as any);

                // D. Parse the plugins using the strict schemas
                const resolvedPlugins = await PluginsTuple.parseAsync(step.plugins);

                // E. Final Step Assembly (same as before, but now using the strictly parsed plugins)
                const resolvedModel = transformModelConfig(stepContext.model!); // Context has the merged model

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

                const outputPathTemplate = step.outputPath ?? looseConfig.outputPath;
                const timeout = step.timeout ?? looseConfig.timeout;

                return {
                    // Base properties
                    output: step.output,
                    outputPath: outputPathTemplate,
                    outputTemplate: outputPathTemplate,
                    timeout,
                    tmpDir: looseConfig.tmpDir,
                    candidates: step.candidates,
                    aspectRatio: step.aspectRatio,
                    
                    // Resolved Components
                    model: resolvedModel,
                    judge: resolvedJudge,
                    feedback: resolvedFeedback,
                    plugins: resolvedPlugins,

                    // Original raw config for reference
                    rawConfig: step
                };
            }));

            // Return the fully resolved RuntimeConfig
            return {
                ...looseConfig, // Globals
                steps: resolvedSteps
            };
        });
    };
};

// Backward compatibility export (though mostly unused now)
export const StepConfigSchema = StepBaseSchema.extend({
    plugins: z.array(z.any())
});
