import { z } from 'zod';
import os from 'os';
import path from 'path';
import {
    PromptDefSchema,
    ModelConfigSchema,
    OutputConfigSchema
} from './common.js';
import { PluginUnionSchema } from './pluginUnion.js';

// Re-export common schemas for backward compatibility if needed
export { PromptDefSchema, ModelConfigSchema, OutputConfigSchema };

// =============================================================================
// Core Schemas
// =============================================================================

/**
 * URL Expander preprocessor schema
 */
export const UrlExpanderSchema = z.object({
    type: z.literal('url-expander'),
    mode: z.enum(['fetch', 'puppeteer']).default('puppeteer'),
    maxChars: z.number().int().positive().default(30000)
});

/**
 * Preprocessor schema - union of all preprocessor types
 */
export const PreprocessorSchema = z.discriminatedUnion('type', [
    UrlExpanderSchema
]);

/**
 * Feedback configuration
 */
export const FeedbackConfigSchema = ModelConfigSchema.extend({
    loops: z.number().int().min(0).default(0)
});

/**
 * Step configuration
 */
export const StepConfigSchema = z.object({
    prompt: PromptDefSchema.optional(),
    system: PromptDefSchema.optional(),
    model: ModelConfigSchema.optional(),
    // Use the discriminated union for strict plugin validation
    plugins: z.array(PluginUnionSchema).default([]),
    preprocessors: z.array(PreprocessorSchema).default([]),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }),
    outputPath: z.string().optional(),
    schema: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
    candidates: z.number().int().positive().default(1),
    skipCandidateCommand: z.boolean().default(false),
    judge: ModelConfigSchema.optional(),
    feedback: FeedbackConfigSchema.optional(),
    aspectRatio: z.string().optional(),
    command: z.string().optional(),
    verifyCommand: z.string().optional(),
    timeout: z.number().int().positive().optional() // Inherits from global if undefined
});

/**
 * Data configuration
 */
export const DataConfigSchema = z.object({
    format: z.enum(['csv', 'json', 'auto']).default('auto'),
    offset: z.number().int().min(0).optional(),
    limit: z.number().int().positive().optional()
});

/**
 * Global configuration
 */
export const GlobalsConfigSchema = z.object({
    model: z.string().default('gpt-4o-mini'),
    temperature: z.number().min(0).max(2).optional(),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    concurrency: z.number().int().positive().default(50),
    taskConcurrency: z.number().int().positive().default(100),
    tmpDir: z.string().default(path.join(os.tmpdir(), 'batchprompt')),
    outputPath: z.string().optional(),
    dataOutputPath: z.string().optional(),
    timeout: z.number().int().positive().default(180)
});

/**
 * Top-level pipeline configuration
 */
export const PipelineConfigSchema = z.object({
    data: DataConfigSchema.optional().default(DataConfigSchema.parse({})),
    globals: GlobalsConfigSchema.optional().default(GlobalsConfigSchema.parse({})),
    steps: z.array(StepConfigSchema).min(1)
});
