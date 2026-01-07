import { z } from 'zod';
import { PromptSchema } from './prompt.js';

/**
 * Base model configuration without defaults.
 * Used for plugin sub-components that inherit from parent.
 */
export const BaseModelConfigSchema = z.object({
    model: z.string().optional().describe("Model to use. Inherits from parent if not set."),
    temperature: z.number().min(0).max(2).optional().describe("Temperature for generation."),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional().describe("Reasoning effort level."),
    system: PromptSchema.optional().describe("System prompt."),
    prompt: PromptSchema.optional().describe("User prompt/instructions.")
}).describe("Base model configuration (all fields optional).");

/**
 * Model configuration with defaults.
 * Used for step-level configuration.
 */
export const ModelConfigSchema = z.object({
    model: z.string().default('google/gemini-3-flash-preview').describe("Model to use."),
    temperature: z.number().min(0).max(2).default(0.7).describe("Temperature for generation."),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional().describe("Reasoning effort level."),
    system: PromptSchema.optional().describe("System prompt."),
    prompt: PromptSchema.optional().describe("User prompt/instructions.")
}).describe("Model configuration for a step.");

/**
 * Alias for backward compatibility.
 * Plugins use this for nested model configurations.
 */
export const PluginModelConfigSchema = BaseModelConfigSchema;

export type BaseModelConfig = z.infer<typeof BaseModelConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type PluginModelConfig = z.infer<typeof PluginModelConfigSchema>;
