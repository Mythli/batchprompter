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
