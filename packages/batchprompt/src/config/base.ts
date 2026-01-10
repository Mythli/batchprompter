import { z } from 'zod';
import os from 'os';
import path from 'path';
import {
    PromptSchema,
    RawModelConfigSchema,
    OutputConfigSchema
} from './schemas/index.js';
import { zHandlebars } from './validationRules.js';

// 1. Globals Schema
export const getGlobalsSchema = () => z.object({
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
    offset: z.number().int().min(0).optional(),
    data: z.array(z.record(z.string(), z.any())).default([{}]),
});

export type GlobalsConfig = z.infer<ReturnType<typeof getGlobalsSchema>>;
export const GlobalsConfigSchema = getGlobalsSchema();

// 2. Feedback Schema
export const FeedbackConfigSchema = RawModelConfigSchema.extend({
    loops: z.number().int().min(0).default(0).describe("Number of feedback iterations to run.")
});

// 3. Step Base Schema
export const getStepBaseSchema = () => z.object({
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
    schema: z.any().optional(),
});

export type StepBaseConfig = z.infer<ReturnType<typeof getStepBaseSchema>>;
export const StepBaseSchema = getStepBaseSchema();
