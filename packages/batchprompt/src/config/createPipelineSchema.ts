import { z } from 'zod';
import path from 'path';
import os from 'os';
import { PluginRegistryV2 } from '../plugins/types.js';
import { ModelConfigSchema, OutputConfigSchema } from './schemas/index.js';

export function createPipelineSchema(registry: PluginRegistryV2, jsonSchemaType: z.ZodType<any>, isInputMode: boolean) {
    
    const pluginSchemas = registry.getAll().map(p => p.configSchema);
    
    const PluginUnion = pluginSchemas.length > 0 
        ? z.discriminatedUnion('type', pluginSchemas as any)
        : z.object({ type: z.string() });

    const StepSchema = z.object({
        prompt: z.string().optional(),
        system: z.string().optional(),
        model: ModelConfigSchema.optional(),
        plugins: z.array(PluginUnion).default([]),
        output: OutputConfigSchema.default({ mode: 'ignore', explode: false }),
        outputPath: z.string().optional(),
        schema: jsonSchemaType.optional(),
        candidates: z.number().int().positive().default(1),
        judge: ModelConfigSchema.optional(),
        feedback: ModelConfigSchema.extend({
            loops: z.number().int().min(0).default(0)
        }).optional(),
        aspectRatio: z.string().optional(),
        timeout: z.number().int().positive().optional()
    });

    return z.object({
        model: z.string().default('google/gemini-3-flash-preview'),
        temperature: z.number().min(0).max(2).optional(),
        thinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
        concurrency: z.number().int().positive().default(50),
        taskConcurrency: z.number().int().positive().default(100),
        tmpDir: z.string().default(path.join(os.tmpdir(), 'batchprompt')),
        outputPath: z.string().optional(),
        dataOutputPath: z.string().optional(),
        timeout: z.number().int().positive().default(180),
        inputLimit: z.number().int().positive().optional(),
        inputOffset: z.number().int().min(0).optional(),
        limit: z.number().int().positive().optional(),
        offset: z.number().int().min(0).optional(),
        data: z.array(z.record(z.string(), z.any())).default([{}]),
        steps: z.array(StepSchema).min(1)
    });
}
