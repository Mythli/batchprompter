import { z } from 'zod';

/**
 * Schema for prompt definitions.
 * Can be:
 * - A string (raw text or template)
 * - An array of ContentParts (already loaded/structured)
 */
export const PromptSchema = z.union([
    z.string(),
    z.array(z.any()) // ContentPart[]
]).describe("Prompt definition: string or ContentPart[]");

export type PromptDef = z.infer<typeof PromptSchema>;
