import { z } from 'zod';
import os from 'os';
import path from 'path';
import {
    PromptDefSchema,
    ModelConfigSchema,
    OutputConfigSchema
} from './common.js';
import { PluginUnionSchema, LoosePluginUnionSchema } from './pluginUnion.js';
import { zJsonSchemaObject, zHandlebars } from './validationRules.js';

// Re-export common schemas
export { PromptDefSchema, ModelConfigSchema, OutputConfigSchema };

// =============================================================================
// Core Schemas
// =============================================================================

export const FeedbackConfigSchema = ModelConfigSchema.extend({
    loops: z.number().int().min(0).default(0).describe("Number of feedback iterations to run.")
}).describe("Configuration for the feedback loop (self-correction).");

// --- Strict Step Schema (Runtime / Generation) ---
export const StepConfigSchema = z.object({
    prompt: PromptDefSchema.optional().describe("The main instruction for this step."),
    system: PromptDefSchema.optional().describe("System instruction for this step."),
    model: ModelConfigSchema.optional().describe("Model configuration for this step."),
    plugins: z.array(PluginUnionSchema).default([]).describe("List of plugins to execute before the model."),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }).describe("How to save the result of this step."),
    outputPath: zHandlebars.optional().describe("Template for saving the result to a file (e.g., 'out/{{id}}.md')."),
    schema: zJsonSchemaObject.optional().describe("JSON Schema to enforce structured output from the model."), // Strict: Object only
    candidates: z.number().int().positive().default(1).describe("Number of candidate responses to generate."),
    judge: ModelConfigSchema.optional().describe("Configuration for a judge model to select the best candidate."),
    feedback: FeedbackConfigSchema.optional().describe("Configuration for a feedback loop to improve the result."),
    aspectRatio: z.string().optional().describe("Aspect ratio for image generation (e.g., '16:9')."),
    timeout: z.number().int().positive().optional().describe("Timeout in seconds for this step.")
}).describe("Configuration for a single step in the pipeline.");

// --- Loose Step Schema (Input / CLI) ---
export const LooseStepConfigSchema = StepConfigSchema.extend({
    schema: z.union([z.string(), zJsonSchemaObject]).optional(),
    plugins: z.array(LoosePluginUnionSchema).default([])
});

export const DataConfigSchema = z.object({
    format: z.enum(['csv', 'json', 'auto']).default('auto').describe("Format of the input data."),
    offset: z.number().int().min(0).optional().describe("Start processing from this row index."),
    limit: z.number().int().positive().optional().describe("Limit the number of rows to process."),
    rows: z.array(z.record(z.string(), z.any())).default([{}]).describe("The input data rows.")
}).describe("Configuration for input data loading.");

export const GlobalsConfigSchema = z.object({
    model: z.string().default('google/gemini-3-flash-preview').describe("Default model to use if not specified in a step."),
    temperature: z.number().min(0).max(2).optional().describe("Default temperature."),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional().describe("Default thinking level."),
    concurrency: z.number().int().positive().default(50).describe("Max concurrent LLM requests."),
    taskConcurrency: z.number().int().positive().default(100).describe("Max concurrent row processing tasks."),
    tmpDir: zHandlebars.default(path.join(os.tmpdir(), 'batchprompt')).describe("Directory for temporary files."),
    outputPath: zHandlebars.optional().describe("Default output path template."),
    dataOutputPath: z.string().optional().describe("Path to save the final dataset (CSV/JSON)."),
    timeout: z.number().int().positive().default(180).describe("Default timeout in seconds for steps."),
    
    // Limit & Offset Configuration
    inputLimit: z.number().int().positive().optional().describe("Max rows to read from source."),
    inputOffset: z.number().int().min(0).optional().describe("Starting row index from source."),
    limit: z.number().int().positive().optional().describe("Default max items to keep when exploding."),
    offset: z.number().int().min(0).optional().describe("Default starting index when exploding.")
}).describe("Global configuration settings.");

// --- Strict Pipeline Schema ---
export const PipelineConfigSchema = z.object({
    data: DataConfigSchema.optional().default(DataConfigSchema.parse({})).describe("Input data configuration."),
    globals: GlobalsConfigSchema.optional().default(GlobalsConfigSchema.parse({})).describe("Global settings."),
    steps: z.array(StepConfigSchema).min(1).describe("List of steps to execute.")
}).describe("Root configuration for the BatchPrompt pipeline.");

// --- Loose Pipeline Schema ---
export const LoosePipelineConfigSchema = PipelineConfigSchema.extend({
    steps: z.array(LooseStepConfigSchema).min(1)
});
