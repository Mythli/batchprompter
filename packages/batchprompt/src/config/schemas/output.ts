import { z } from 'zod';

/**
 * Schema for output configuration.
 * Controls how results are saved/merged into the row.
 */
export const OutputConfigSchema = z.object({
    mode: z.enum(['merge', 'column', 'ignore']).default('ignore')
        .describe("How to handle the result: merge into row, save to column, or ignore."),
    column: z.string().optional()
        .describe("Column name when mode is 'column'."),
    explode: z.boolean().default(false)
        .describe("If true, array results create multiple rows."),
    limit: z.number().int().positive().optional()
        .describe("Max items to keep when exploding."),
    offset: z.number().int().min(0).optional()
        .describe("Starting index when exploding.")
}).describe("Configuration for output handling.");

export type OutputConfig = z.infer<typeof OutputConfigSchema>;

/**
 * Default output configuration for plugins.
 */
export const DEFAULT_PLUGIN_OUTPUT = {
    mode: 'ignore' as const,
    explode: false
};
