import { z } from 'zod';
import os from 'os';
import path from 'path';
import { 
    PromptSchema,
    ModelConfigSchema, 
    OutputConfigSchema 
} from './schemas/index.js';
import { zJsonSchemaObject, zHandlebars } from './validationRules.js';
import { UrlExpanderStepExtension } from '../plugins/url-expander/UrlExpanderConfig.js';

// =============================================================================
// Re-exports for backward compatibility
// =============================================================================

export { PromptSchema as PromptDefSchema, ModelConfigSchema, OutputConfigSchema };

// =============================================================================
// Feedback Schema
// =============================================================================

export const FeedbackConfigSchema = ModelConfigSchema.extend({
    loops: z.number().int().min(0).default(0).describe("Number of feedback iterations to run.")
}).describe("Configuration for the feedback loop (self-correction).");

// =============================================================================
// Global Configuration Schema
// =============================================================================

export const GlobalsConfigSchema = z.object({
    model: z.string().default('google/gemini-3-flash-preview')
        .describe("Default model to use if not specified in a step."),
    temperature: z.number().min(0).max(2).optional()
        .describe("Default temperature."),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional()
        .describe("Default thinking level."),
    concurrency: z.number().int().positive().default(50)
        .describe("Max concurrent LLM requests."),
    taskConcurrency: z.number().int().positive().default(100)
        .describe("Max concurrent row processing tasks."),
    tmpDir: zHandlebars.default(path.join(os.tmpdir(), 'batchprompt'))
        .describe("Directory for temporary files."),
    outputPath: zHandlebars.optional()
        .describe("Default output path template."),
    dataOutputPath: z.string().optional()
        .describe("Path to save the final dataset (CSV/JSON)."),
    timeout: z.number().int().positive().default(180)
        .describe("Default timeout in seconds for steps."),
    inputLimit: z.number().int().positive().optional()
        .describe("Max rows to read from source."),
    inputOffset: z.number().int().min(0).optional()
        .describe("Starting row index from source."),
    limit: z.number().int().positive().optional()
        .describe("Default max items to keep when exploding."),
    offset: z.number().int().min(0).optional()
        .describe("Default starting index when exploding.")
}).describe("Global configuration settings.");

// =============================================================================
// Step Schema Factory
// =============================================================================

/**
 * Creates a step config schema with the given plugin union and schema field type.
 * This is the single source of truth for step configuration structure.
 */
export function createStepSchema<TPlugin extends z.ZodTypeAny, TSchema extends z.ZodTypeAny>(
    pluginUnion: TPlugin,
    schemaFieldType: TSchema
) {
    return z.object({
        prompt: PromptSchema.optional().describe("The main instruction for this step."),
        system: PromptSchema.optional().describe("System instruction for this step."),
        model: ModelConfigSchema.optional().describe("Model configuration for this step."),
        output: OutputConfigSchema.default({
            mode: 'ignore',
            explode: false
        }).describe("How to save the result of this step."),
        outputPath: zHandlebars.optional().describe("Template for saving the result to a file."),
        candidates: z.number().int().positive().default(1).describe("Number of candidate responses to generate."),
        judge: ModelConfigSchema.optional().describe("Configuration for a judge model to select the best candidate."),
        feedback: FeedbackConfigSchema.optional().describe("Configuration for a feedback loop to improve the result."),
        aspectRatio: z.string().optional().describe("Aspect ratio for image generation (e.g., '16:9')."),
        timeout: z.number().int().positive().optional().describe("Timeout in seconds for this step."),
        schema: schemaFieldType.optional().describe("JSON Schema to enforce structured output."),
        plugins: z.array(pluginUnion).default([]).describe("List of plugins to execute before the model.")
    }).merge(UrlExpanderStepExtension).describe("Configuration for a single step in the pipeline.");
}

/**
 * Creates a full pipeline schema with the given plugin union and schema field type.
 * Used by CLI to generate JSON Schema with all registered plugins.
 */
export function createPipelineSchema<TPlugin extends z.ZodTypeAny, TSchema extends z.ZodTypeAny>(
    pluginUnion: TPlugin,
    schemaFieldType: TSchema
) {
    const StepSchema = createStepSchema(pluginUnion, schemaFieldType);
    
    return GlobalsConfigSchema.extend({
        data: z.array(z.record(z.string(), z.any())).default([{}])
            .describe("The input data rows."),
        steps: z.array(StepSchema).min(1)
            .describe("List of steps to execute.")
    });
}

// =============================================================================
// Pre-built Pipeline Schemas
// =============================================================================

// Note: We no longer export static schemas like LoosePipelineConfigSchema here
// because the plugin union is dynamic. Consumers should use createPipelineSchema
// with the schema from the PluginRegistry.
