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

export function createPipelineSchema(pluginRegistry: PluginRegistryV2) {
    
    // The input schema allows any plugins array, we validate them in the transform
    const StepInputSchema = StepBaseSchema.extend({
        plugins: z.array(z.record(z.string(), z.any())).default([])
    });

    const PipelineInputSchema = GlobalsConfigSchema.extend({
        data: z.array(z.record(z.string(), z.any())).default([{}]),
        steps: z.array(StepInputSchema).min(1)
    });

    return PipelineInputSchema.transform(async (pipeline) => {
        // 1. Resolve Globals
        // (Already parsed by Zod, but we capture them for passing down)
        const globals: GlobalsConfig = {
            model: pipeline.model,
            temperature: pipeline.temperature,
            thinkingLevel: pipeline.thinkingLevel,
            concurrency: pipeline.concurrency,
            taskConcurrency: pipeline.taskConcurrency,
            tmpDir: pipeline.tmpDir,
            outputPath: pipeline.outputPath,
            dataOutputPath: pipeline.dataOutputPath,
            timeout: pipeline.timeout,
            inputLimit: pipeline.inputLimit,
            inputOffset: pipeline.inputOffset,
            limit: pipeline.limit,
            offset: pipeline.offset
        };

        // 2. Resolve Steps
        const resolvedSteps = await Promise.all(pipeline.steps.map(async (step, stepIndex) => {
            // A. Merge Global Defaults into Step Model
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

            // Transform to messages immediately for the Step's own model
            const resolvedModel = transformModelConfig(mergedStepModelConfig);

            // Resolve Judge & Feedback
            let resolvedJudge;
            if (step.judge) {
                resolvedJudge = transformModelConfig({
                    model: step.judge.model ?? mergedStepModelConfig.model,
                    temperature: step.judge.temperature ?? mergedStepModelConfig.temperature,
                    thinkingLevel: step.judge.thinkingLevel ?? mergedStepModelConfig.thinkingLevel,
                    system: step.judge.system,
                    prompt: step.judge.prompt
                });
            }

            let resolvedFeedback;
            if (step.feedback) {
                const fbConfig = transformModelConfig({
                    model: step.feedback.model ?? mergedStepModelConfig.model,
                    temperature: step.feedback.temperature ?? mergedStepModelConfig.temperature,
                    thinkingLevel: step.feedback.thinkingLevel ?? mergedStepModelConfig.thinkingLevel,
                    system: step.feedback.system,
                    prompt: step.feedback.prompt
                });
                resolvedFeedback = { ...fbConfig, loops: step.feedback.loops };
            }

            // Create the StepBaseConfig object to pass to plugins
            // We pass the *merged* model config so plugins can inherit from it
            const stepBaseConfig: StepBaseConfig = {
                ...step,
                model: mergedStepModelConfig // Pass the merged config, not the resolved messages yet
            };

            // B. Resolve Plugins
            const resolvedPlugins = await Promise.all(step.plugins.map(async (pluginRaw, pluginIdx) => {
                const type = pluginRaw.type;
                const pluginInstance = pluginRegistry.get(type);

                if (!pluginInstance) {
                    throw new Error(`Unknown plugin type: ${type} in step ${stepIndex + 1}`);
                }

                // Get the dynamic schema for this plugin in this context
                const pluginSchema = pluginInstance.getSchema(stepBaseConfig, globals);

                // Parse and transform the plugin config
                const resolvedPluginConfig = await pluginSchema.parseAsync(pluginRaw);

                return {
                    type: type,
                    id: resolvedPluginConfig.id ?? `${type}-${stepIndex}-${pluginIdx}`,
                    output: resolvedPluginConfig.output,
                    config: resolvedPluginConfig,
                    instance: pluginInstance
                };
            }));

            // C. Final Step Configuration
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
                plugins: resolvedPlugins,

                // Original raw config for reference if needed
                rawConfig: step
            };
        }));

        return {
            ...globals,
            data: pipeline.data,
            steps: resolvedSteps
        };
    });
}

// Backward compatibility export (though mostly unused now)
export const StepConfigSchema = StepBaseSchema.extend({
    plugins: z.array(z.any())
});
