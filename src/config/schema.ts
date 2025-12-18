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
    mode: z.enum(['merge', 'column', 'ignore']).default('ignore'),
    column: z.string().optional(),
    explode: z.boolean().default(false),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().min(0).optional()
});

/**
 * Base plugin schema - all plugins extend this
 */
export const BasePluginSchema = z.object({
    type: z.string(),
    id: z.string().optional(),
    // Use .default(...) with explicit values to satisfy strict TS checks
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    })
});

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
    plugins: z.array(BasePluginSchema.passthrough()).default([]),
    preprocessors: z.array(PreprocessorSchema).default([]),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }),
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
    tmpDir: z.string().default('.tmp'),
    dataOutputPath: z.string().optional(),
    timeout: z.number().int().positive().default(180)
});

/**
 * Top-level pipeline configuration
 */
export const PipelineConfigSchema = z.object({
    data: DataConfigSchema,
    globals: GlobalsConfigSchema.default({
        model: 'gpt-4o-mini',
        concurrency: 50,
        taskConcurrency: 100,
        tmpDir: '.tmp',
        timeout: 180
    }),
    steps: z.array(StepConfigSchema).min(1)
});
