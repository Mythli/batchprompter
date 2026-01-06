import { z } from 'zod';
import path from 'path';
import os from 'os';
import { PluginRegistryV2 } from '../plugins/types.js';
import { ModelConfigSchema } from './schemas/model.js';
import { OutputConfigSchema } from './common.js';

export function createPipelineSchema(registry: PluginRegistryV2, jsonSchemaType: z.ZodType<any>, isInputMode: boolean) {
    
    const pluginSchemas = registry.getAll().map(p => p.configSchema);
    
    const PluginUnion = pluginSchemas.length > 0 
        ? z.discriminatedUnion('type', pluginSchemas as any)
        : z.object({ type: z.string() }).passthrough();

    // Use .optional().default({}) to allow empty input for objects that have defaults
    const SafeModelConfigSchema = ModelConfigSchema.optional().default({});
    const SafeOutputConfigSchema = OutputConfigSchema.optional().default({});

    let StepSchema = z.object({
        // Model
        model: SafeModelConfigSchema,
        
        // Execution
        timeout: z.number().int().positive().default(180),
        candidates: z.number().int().positive().default(1),
        
        // I/O
        output: SafeOutputConfigSchema,
        outputPath: z.string().optional(), // Template
        
        // Validation
        schema: jsonSchemaType.optional(),

        // Plugins
        plugins: z.array(PluginUnion).default([]),

        // Judge & Feedback (Reuse ModelConfig)
        judge: ModelConfigSchema.optional(),
        feedback: ModelConfigSchema.extend({
            loops: z.number().int().min(0).default(0)
        }).optional(),

        // Misc
        aspectRatio: z.string().optional(),
        
        // Legacy/Compat
        verifyCommand: z.string().optional(),
        command: z.string().optional(),
        skipCandidateCommand: z.boolean().optional(),
    });

    // In Input Mode, merge plugin extensions (shortcuts) into the Step Schema
    if (isInputMode) {
        for (const plugin of registry.getAll()) {
            if (plugin.stepExtensionSchema) {
                // Ensure stepExtensionSchema is treated as an object schema for merge
                if (plugin.stepExtensionSchema instanceof z.ZodObject) {
                    StepSchema = StepSchema.merge(plugin.stepExtensionSchema);
                }
            }
        }
    }

    return z.object({
        globals: z.object({
            model: z.string().optional(),
            temperature: z.number().optional(),
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
            offset: z.number().int().min(0).optional()
        }).default({}),
        data: z.array(z.record(z.string(), z.any())).default([{}]),
        steps: z.array(StepSchema).min(1)
    });
}
