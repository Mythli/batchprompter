import { z } from 'zod';
import os from 'os';
import path from 'path';
import { 
    PromptSchema,
    RawModelConfigSchema, 
    OutputConfigSchema,
    transformModelConfig
} from './schemas/index.js';
import { zJsonSchemaObject, zHandlebars } from './validationRules.js';
import { UrlExpanderStepExtension } from '../plugins/url-expander/UrlExpanderConfig.js';

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

// =============================================================================
// Step Schema
// =============================================================================

export function createStepSchema<TPlugin extends z.ZodTypeAny, TSchema extends z.ZodTypeAny>(
    pluginUnion: TPlugin,
    schemaFieldType: TSchema
) {
    return z.object({
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
        schema: schemaFieldType.optional(),
        plugins: z.array(pluginUnion).default([])
    }).merge(UrlExpanderStepExtension);
}

export const StepConfigSchema = createStepSchema(z.any(), z.any()); // Placeholder for type inference
export const LooseStepConfigSchema = StepConfigSchema; // Alias for now if they are the same structure in this context

// =============================================================================
// Pipeline Schema with Inheritance Logic
// =============================================================================

export const PipelineConfigInputSchema = GlobalsConfigSchema.extend({
    data: z.array(z.record(z.string(), z.any())).default([{}]),
    steps: z.array(StepConfigSchema).min(1)
});

export function createPipelineSchema<TPlugin extends z.ZodTypeAny, TSchema extends z.ZodTypeAny>(
    pluginUnion: TPlugin,
    schemaFieldType: TSchema
) {
    const StepSchema = createStepSchema(pluginUnion, schemaFieldType);
    
    const Base = GlobalsConfigSchema.extend({
        data: z.array(z.record(z.string(), z.any())).default([{}]),
        steps: z.array(StepSchema).min(1)
    });

    return Base.transform(pipeline => {
        // --- Inheritance Logic ---
        
        const globalModelDefaults = {
            model: pipeline.model,
            temperature: pipeline.temperature,
            thinkingLevel: pipeline.thinkingLevel
        };

        const resolvedSteps = pipeline.steps.map((step, stepIndex) => {
            // 1. Merge Global -> Step Model
            // Step-level 'prompt' and 'system' are shortcuts for 'model.prompt' and 'model.system'
            const rawStepModel = step.model || {};
            
            const mergedStepModel = {
                model: rawStepModel.model ?? globalModelDefaults.model,
                temperature: rawStepModel.temperature ?? globalModelDefaults.temperature,
                thinkingLevel: rawStepModel.thinkingLevel ?? globalModelDefaults.thinkingLevel,
                system: rawStepModel.system ?? step.system,
                prompt: rawStepModel.prompt ?? step.prompt
            };

            // 2. Transform Step Model to Messages
            const resolvedModel = transformModelConfig(mergedStepModel);

            // 3. Resolve Judge & Feedback
            let resolvedJudge;
            if (step.judge) {
                resolvedJudge = transformModelConfig({
                    model: step.judge.model ?? mergedStepModel.model,
                    temperature: step.judge.temperature ?? mergedStepModel.temperature,
                    thinkingLevel: step.judge.thinkingLevel ?? mergedStepModel.thinkingLevel,
                    system: step.judge.system,
                    prompt: step.judge.prompt
                });
            }

            let resolvedFeedback;
            if (step.feedback) {
                const fbConfig = transformModelConfig({
                    model: step.feedback.model ?? mergedStepModel.model,
                    temperature: step.feedback.temperature ?? mergedStepModel.temperature,
                    thinkingLevel: step.feedback.thinkingLevel ?? mergedStepModel.thinkingLevel,
                    system: step.feedback.system,
                    prompt: step.feedback.prompt
                });
                resolvedFeedback = { ...fbConfig, loops: step.feedback.loops };
            }

            // 4. Process Plugins (Push-down inheritance)
            const resolvedPlugins = step.plugins.map((plugin: any, pluginIdx: number) => {
                const pluginOutput = plugin.output || { mode: 'ignore', explode: false };
                
                // Propagate global limits if exploding
                if (pluginOutput.explode) {
                    pluginOutput.limit ??= pipeline.limit;
                    pluginOutput.offset ??= pipeline.offset;
                }

                // Merge Step Model into Plugin Models
                // We iterate over keys to find model configs (heuristic: ends with 'Model')
                const rawConfig = plugin.rawConfig || plugin; // Handle pre-parsed or raw
                const mergedPluginConfig = { ...rawConfig };

                for (const key of Object.keys(mergedPluginConfig)) {
                    if (key.endsWith('Model') && typeof mergedPluginConfig[key] === 'object') {
                        const pModel = mergedPluginConfig[key];
                        // Merge step defaults
                        const mergedPModel = {
                            model: pModel.model ?? mergedStepModel.model,
                            temperature: pModel.temperature ?? mergedStepModel.temperature,
                            thinkingLevel: pModel.thinkingLevel ?? mergedStepModel.thinkingLevel,
                            system: pModel.system,
                            prompt: pModel.prompt
                        };
                        // Transform to messages immediately
                        mergedPluginConfig[key] = transformModelConfig(mergedPModel);
                    }
                }

                return {
                    type: plugin.type,
                    id: plugin.id ?? `${plugin.type}-${stepIndex}-${pluginIdx}`,
                    output: pluginOutput,
                    rawConfig: mergedPluginConfig
                };
            });

            // 5. Resolve Output Path
            const outputPathTemplate = step.outputPath ?? pipeline.outputPath;
            
            // 6. Resolve Timeout
            const timeout = step.timeout ?? pipeline.timeout;

            return {
                ...step,
                model: resolvedModel,
                judge: resolvedJudge,
                feedback: resolvedFeedback,
                plugins: resolvedPlugins,
                outputPath: outputPathTemplate,
                outputTemplate: outputPathTemplate,
                timeout,
                tmpDir: pipeline.tmpDir,
                // Clean up shortcuts
                prompt: undefined,
                system: undefined
            };
        });

        return {
            ...pipeline,
            steps: resolvedSteps
        };
    });
}

export const PipelineConfigSchema = createPipelineSchema(z.any(), z.any());
