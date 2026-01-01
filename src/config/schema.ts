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

export const UrlExpanderSchema = z.object({
    type: z.literal('url-expander'),
    mode: z.enum(['fetch', 'puppeteer']).default('puppeteer'),
    maxChars: z.number().int().positive().default(30000)
});

export const PreprocessorSchema = z.discriminatedUnion('type', [
    UrlExpanderSchema
]);

export const FeedbackConfigSchema = ModelConfigSchema.extend({
    loops: z.number().int().min(0).default(0)
});

// --- Strict Step Schema (Runtime / Generation) ---
export const StepConfigSchema = z.object({
    prompt: PromptDefSchema.optional(),
    system: PromptDefSchema.optional(),
    model: ModelConfigSchema.optional(),
    plugins: z.array(PluginUnionSchema).default([]),
    preprocessors: z.array(PreprocessorSchema).default([]),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }),
    outputPath: zHandlebars.optional(),
    schema: zJsonSchemaObject.optional(), // Strict: Object only
    candidates: z.number().int().positive().default(1),
    skipCandidateCommand: z.boolean().default(false),
    judge: ModelConfigSchema.optional(),
    feedback: FeedbackConfigSchema.optional(),
    aspectRatio: z.string().optional(),
    command: zHandlebars.optional(),
    verifyCommand: zHandlebars.optional(),
    timeout: z.number().int().positive().optional()
});

// --- Loose Step Schema (Input / CLI) ---
export const LooseStepConfigSchema = StepConfigSchema.extend({
    schema: z.union([z.string(), zJsonSchemaObject]).optional(),
    plugins: z.array(LoosePluginUnionSchema).default([])
});

export const DataConfigSchema = z.object({
    format: z.enum(['csv', 'json', 'auto']).default('auto'),
    offset: z.number().int().min(0).optional(),
    limit: z.number().int().positive().optional()
});

export const GlobalsConfigSchema = z.object({
    model: z.string().default('google/gemini-3-flash-preview'),
    temperature: z.number().min(0).max(2).optional(),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    concurrency: z.number().int().positive().default(50),
    taskConcurrency: z.number().int().positive().default(100),
    tmpDir: zHandlebars.default(path.join(os.tmpdir(), 'batchprompt')),
    outputPath: zHandlebars.optional(),
    dataOutputPath: z.string().optional(),
    timeout: z.number().int().positive().default(180)
});

// --- Strict Pipeline Schema ---
export const PipelineConfigSchema = z.object({
    data: DataConfigSchema.optional().default(DataConfigSchema.parse({})),
    globals: GlobalsConfigSchema.optional().default(GlobalsConfigSchema.parse({})),
    steps: z.array(StepConfigSchema).min(1)
});

// --- Loose Pipeline Schema ---
export const LoosePipelineConfigSchema = PipelineConfigSchema.extend({
    steps: z.array(LooseStepConfigSchema).min(1)
});
