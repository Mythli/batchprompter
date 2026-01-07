import { z } from 'zod';
import { ModelConfigSchema } from './schemas/model.js';

export { ModelConfigSchema };

export const OutputConfigSchema = z.object({
    mode: z.enum(['merge', 'column', 'ignore']).default('ignore'),
    column: z.string().optional(),
    explode: z.boolean().default(false),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().min(0).optional()
});

// Re-export for compatibility if needed, though we are moving to ModelConfigSchema
export const PromptDefSchema = z.union([
    z.string(),
    z.object({
        file: z.string().optional(),
        text: z.string().optional(),
        parts: z.array(z.any()).optional()
    })
]);

/**
 * Model configuration for plugin sub-components.
 * All fields are optional - they inherit from step/global if not set.
 */
export const PluginModelConfigSchema = z.object({
    model: z.string().optional().describe("Model to use. Inherits from step/global if not set."),
    temperature: z.number().min(0).max(2).optional().describe("Temperature for generation."),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional().describe("Reasoning effort level."),
    system: PromptDefSchema.optional().describe("System prompt."),
    prompt: PromptDefSchema.optional().describe("User prompt/instructions.")
}).describe("Model configuration for a plugin sub-component.");

export type PluginModelConfig = z.infer<typeof PluginModelConfigSchema>;
