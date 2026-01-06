import { z } from 'zod';

// Prompt can be a string (template/path) or structured parts
export const PromptSchema = z.union([
    z.string(),
    z.array(z.any()) // ContentPart[]
]);

export const ModelConfigSchema = z.object({
    model: z.string().default('google/gemini-3-flash-preview'),
    temperature: z.number().min(0).max(2).default(0.7),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    system: PromptSchema.optional(),
    prompt: PromptSchema.optional(),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;
