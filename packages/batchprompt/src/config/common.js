import { z } from 'zod';
// =============================================================================
// Shared / Base Schemas (Single source of truth for defaults)
// =============================================================================
/**
 * Prompt definition - can be a simple string (auto-detected as file path or inline text)
 * or an object with explicit type
 */
export const PromptDefSchema = z.union([
    z.string().describe("A simple text prompt or a file path to a prompt file."),
    z.object({
        file: z.string().optional().describe("Path to a file containing the prompt text."),
        text: z.string().optional().describe("Inline prompt text."),
        parts: z.array(z.object({
            type: z.enum(['text', 'image', 'audio']).describe("Type of content part."),
            content: z.string().describe("The content (text, URL, or base64 data).")
        })).optional().describe("Array of content parts for multimodal prompts.")
    }).describe("Structured prompt definition.")
]).describe("Defines the input prompt for the model. Can be a string or a structured object.");
/**
 * Standard Model configuration (nested structure)
 * Used for main step model, judge, feedback, etc.
 */
export const ModelConfigSchema = z.object({
    model: z.string().optional().describe("The ID of the LLM to use (e.g., 'google/gemini-3-flash-preview', 'gpt-4o')."),
    temperature: z.number().min(0).max(2).optional().describe("Sampling temperature. Higher values mean more randomness."),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional().describe("Reasoning effort for models that support it (e.g., o1, o3)."),
    prompt: PromptDefSchema.optional().describe("The user prompt for this model configuration."),
    system: PromptDefSchema.optional().describe("The system prompt/instruction for this model configuration.")
}).describe("Configuration for an LLM model.");
/**
 * Helper to create flat model config fields for plugins.
 * e.g. createFlatModelSchema('navigator') creates:
 * {
 *   navigatorModel: z.string().optional(),
 *   navigatorTemperature: z.number().optional(),
 *   ...
 * }
 */
export const createFlatModelSchema = (prefix) => {
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
    mode: z.enum(['merge', 'column', 'ignore']).default('ignore').describe("How to handle the output. 'merge' adds fields to the row, 'column' saves to a specific column, 'ignore' discards it."),
    column: z.string().optional().describe("The column name to save output to (required if mode is 'column')."),
    explode: z.boolean().default(false).describe("If true, splits array results into multiple rows (one per item)."),
    limit: z.number().int().positive().optional().describe("Limit the number of items if exploding."),
    offset: z.number().int().min(0).optional().describe("Start index for items if exploding.")
}).describe("Controls how the result of this step or plugin is saved to the dataset.");
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
//# sourceMappingURL=common.js.map