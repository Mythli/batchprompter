import { z } from 'zod';
import os from 'os';
import path from 'path';
import { 
    PromptSchema,
    ModelConfigSchema, 
    OutputConfigSchema 
} from './schemas/index.js';
import { PluginUnionSchema, LoosePluginUnionSchema } from './pluginUnion.js';
import { zJsonSchemaObject, zHandlebars } from './validationRules.js';
import { UrlExpanderStepExtension } from '../plugins/url-expander/UrlExpanderConfig.js';

// =============================================================================
// Re-exports for backward compatibility
// =============================================================================

export { PromptSchema as PromptDefSchema, ModelConfigSchema, OutputConfigSchema };

// =============================================================================
// Step-Level Schemas
// =============================================================================

export const FeedbackConfigSchema = ModelConfigSchema.extend({
    loops: z.number().int().min(0).default(0).describe("Number of feedback iterations to run.")
}).describe("Configuration for the feedback loop (self-correction).");

/**
 * Core step configuration (shared between Loose and Strict)
 */
const CoreStepFields = {
    prompt: PromptSchema.optional().describe("The main instruction for this step."),
    system: PromptSchema.optional().describe("System instruction for this step."),
    model: ModelConfigSchema.optional().describe("Model configuration for this step."),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }).describe("How to save the result of this step."),
    outputPath: zHandlebars.optional().describe("Template for saving the result to a file (e.g., 'out/{{id}}.md')."),
    candidates: z.number().int().positive().default(1).describe("Number of candidate responses to generate."),
    judge: ModelConfigSchema.optional().describe("Configuration for a judge model to select the best candidate."),
    feedback: FeedbackConfigSchema.optional().describe("Configuration for a feedback loop to improve the result."),
    aspectRatio: z.string().optional().describe("Aspect ratio for image generation (e.g., '16:9')."),
    timeout: z.number().int().positive().optional().describe("Timeout in seconds for this step.")
};

/**
 * Loose Step Schema - accepts string paths for schema field.
 * Used for input/CLI parsing.
 */
export const LooseStepConfigSchema = z.object({
    ...CoreStepFields,
    schema: z.union([z.string(), zJsonSchemaObject]).optional()
        .describe("JSON Schema to enforce structured output. Can be inline object or file path."),
    plugins: z.array(LoosePluginUnionSchema).default([])
        .describe("List of plugins to execute before the model.")
}).merge(UrlExpanderStepExtension).describe("Configuration for a single step in the pipeline.");

/**
 * Strict Step Schema - requires object for schema field.
 * Used for runtime validation after normalization.
 */
export const StepConfigSchema = z.object({
    ...CoreStepFields,
    schema: zJsonSchemaObject.optional()
        .describe("JSON Schema to enforce structured output from the model."),
    plugins: z.array(PluginUnionSchema).default([])
        .describe("List of plugins to execute before the model.")
}).merge(UrlExpanderStepExtension).describe("Configuration for a single step in the pipeline.");

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
    
    // Limit & Offset Configuration
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
// Pipeline Schemas
// =============================================================================

/**
 * Loose Pipeline Schema - accepts string paths.
 * Used for input/CLI parsing.
 */
export const LoosePipelineConfigSchema = GlobalsConfigSchema.extend({
    data: z.array(z.record(z.string(), z.any())).default([{}])
        .describe("The input data rows."),
    steps: z.array(LooseStepConfigSchema).min(1)
        .describe("List of steps to execute.")
});

/**
 * Strict Pipeline Schema - requires objects.
 * Used for runtime validation after normalization.
 */
export const PipelineConfigSchema = GlobalsConfigSchema.extend({
    data: z.array(z.record(z.string(), z.any())).default([{}])
        .describe("The input data rows."),
    steps: z.array(StepConfigSchema).min(1)
        .describe("List of steps to execute.")
});
