import { z } from 'zod';

/**
 * Schema for prompt definitions.
 * Can be:
 * - A string (raw text or file path)
 * - An array of ContentParts (already loaded)
 * - An object with file, text, or parts properties
 */
export const PromptSchema = z.union([
    z.string(),
    z.array(z.any()), // ContentPart[] - for already-loaded prompts
    z.object({
        file: z.string().optional(),
        text: z.string().optional(),
        parts: z.array(z.any()).optional()
    })
]).describe("Prompt definition: string, ContentPart[], or {file, text, parts}");

export type PromptDef = z.infer<typeof PromptSchema>;
