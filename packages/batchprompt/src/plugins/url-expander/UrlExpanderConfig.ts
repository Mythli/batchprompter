import { z } from 'zod';
import { OutputConfigSchema } from '../../config/index.js';

export const UrlExpanderConfigSchema = z.object({
    type: z.literal('url-expander').describe("Identifies this as a URL expander plugin."),
    id: z.string().optional().describe("Unique ID for this plugin instance."),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }).describe("How to save the expanded content (usually ignored as it modifies prompt)."),
    mode: z.enum(['fetch', 'puppeteer']).default('fetch').describe("Method used to fetch the URL content."),
    maxChars: z.number().int().positive().default(30000).describe("Maximum number of characters to include from the expanded content.")
});

export type UrlExpanderConfig = z.infer<typeof UrlExpanderConfigSchema>;

// The extension schema for the StepConfig
export const UrlExpanderStepExtension = z.object({
    expandUrls: z.union([
        z.boolean().describe("Enable/Disable automatic URL expansion."),
        UrlExpanderConfigSchema.omit({ type: true, output: true }).partial()
    ]).default(true).describe("Configuration for automatic URL expansion.")
});
