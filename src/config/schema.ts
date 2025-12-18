import { z } from 'zod';

// =============================================================================
// Shared / Base Schemas (Single source of truth for defaults)
// =============================================================================

/**
 * Prompt definition - can be a simple string (auto-detected as file path or inline text)
 * or an object with explicit type
 */
export const PromptDefSchema = z.union([
    z.string(),
    z.object({
        file: z.string().optional(),
        text: z.string().optional(),
        parts: z.array(z.object({
            type: z.enum(['text', 'image', 'audio']),
            content: z.string()
        })).optional()
    })
]);

/**
 * Model configuration
 */
export const ModelConfigSchema = z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    prompt: PromptDefSchema.optional(),
    system: PromptDefSchema.optional()
});

/**
 * Output configuration
 */
export const OutputConfigSchema = z.object({
    mode: z.enum(['merge', 'column', 'ignore']).optional().default('ignore'),
    column: z.string().optional(),
    explode: z.boolean().optional().default(false)
});

/**
 * Base plugin schema - all plugins extend this
 */
export const BasePluginSchema = z.object({
    type: z.string(),
    id: z.string().optional(),
    // Use .optional().default({}) to allow empty input, which Zod then fills with defaults
    output: OutputConfigSchema.optional().default({})
});

/**
 * URL Expander preprocessor schema
 */
export const UrlExpanderSchema = z.object({
    type: z.literal('url-expander'),
    mode: z.enum(['fetch', 'puppeteer']).optional().default('puppeteer'),
    maxChars: z.number().int().positive().optional().default(30000)
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
    loops: z.number().int().min(0).optional().default(0)
});

/**
 * Step configuration
 */
export const StepConfigSchema = z.object({
    prompt: PromptDefSchema.optional(),
    system: PromptDefSchema.optional(),
    model: ModelConfigSchema.optional(),
    plugins: z.array(BasePluginSchema.passthrough()).optional().default([]),
    preprocessors: z.array(PreprocessorSchema).optional().default([]),
    output: OutputConfigSchema.optional().default({}),
    schema: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
    candidates: z.number().int().positive().optional().default(1),
    skipCandidateCommand: z.boolean().optional().default(false),
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
    format: z.enum(['csv', 'json', 'auto']).optional().default('auto'),
    offset: z.number().int().min(0).optional(),
    limit: z.number().int().positive().optional()
});

/**
 * Global configuration
 */
export const GlobalsConfigSchema = z.object({
    model: z.string().optional().default('gpt-4o-mini'),
    temperature: z.number().min(0).max(2).optional(),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    concurrency: z.number().int().positive().optional().default(50),
    taskConcurrency: z.number().int().positive().optional().default(100),
    tmpDir: z.string().optional().default('.tmp'),
    dataOutputPath: z.string().optional(),
    timeout: z.number().int().positive().optional().default(180)
});

/**
 * Top-level pipeline configuration
 */
export const PipelineConfigSchema = z.object({
    data: DataConfigSchema,
    globals: GlobalsConfigSchema.optional().default({}),
    steps: z.array(StepConfigSchema).min(1)
});
