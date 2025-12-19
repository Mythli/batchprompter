import { z } from 'zod';

// =============================================================================
// Shared / Base Schemas (Single source of truth for defaults)
// =============================================================================

/**
 * Prompt definition - can be a simple string (auto-detected as file path or inline text)
 * or an object with explicit type
 */
export const PromptDefSchema = z.union([
    z.string(),
    z.object({
        file: z.string().optional(),
        text: z.string().optional(),
        parts: z.array(z.object({
            type: z.enum(['text', 'image', 'audio']),
            content: z.string()
        })).optional()
    })
]);

/**
 * Standard Model configuration (nested structure)
 * Used for main step model, judge, feedback, etc.
 */
export const ModelConfigSchema = z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    prompt: PromptDefSchema.optional(),
    system: PromptDefSchema.optional()
});

/**
 * Helper to create flat model config fields for plugins.
 * e.g. createFlatModelSchema('navigator') creates:
 * {
 *   navigatorModel: z.string().optional(),
 *   navigatorTemperature: z.number().optional(),
 *   ...
 * }
 */
export const createFlatModelSchema = (prefix: string) => {
    return {
        [`${prefix}Model`]: z.string().optional(),
        [`${prefix}Temperature`]: z.number().min(0).max(2).optional(),
        [`${prefix}ThinkingLevel`]: z.enum(['low', 'medium', 'high']).optional(),
        [`${prefix}Prompt`]: PromptDefSchema.optional(),
        [`${prefix}System`]: PromptDefSchema.optional()
    };
};

/**
 * Output configuration
 */
export const OutputConfigSchema = z.object({
    mode: z.enum(['merge', 'column', 'ignore']).default('ignore'),
    column: z.string().optional(),
    explode: z.boolean().default(false),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().min(0).optional()
});

/**
 * Base plugin schema - used for type inference in generic contexts
 */
export const BasePluginSchema = z.object({
    type: z.string(),
    id: z.string().optional(),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    })
});
