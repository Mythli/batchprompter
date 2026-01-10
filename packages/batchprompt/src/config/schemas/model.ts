import { z } from 'zod';
import { PromptSchema } from './prompt.js';
import OpenAI from 'openai';

// Helper to normalize prompt to array of content parts
export function normalizePromptToParts(prompt: any): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
    if (!prompt) return [];
    if (Array.isArray(prompt)) return prompt;
    return [{ type: 'text', text: prompt }];
}

/**
 * Base model configuration.
 * Used for inheritance and merging before transformation.
 */
export const RawModelConfigSchema = z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    system: PromptSchema.optional(),
    prompt: PromptSchema.optional()
});

/**
 * Transforms a raw model config into a resolved one with messages.
 */
export function transformModelConfig(config: z.infer<typeof RawModelConfigSchema>) {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    if (config.system) {
        const parts = normalizePromptToParts(config.system);
        const text = parts.map(p => p.type === 'text' ? p.text : '').join('\n');
        if (text) {
            messages.push({ role: 'system', content: text });
        }
    }

    if (config.prompt) {
        const parts = normalizePromptToParts(config.prompt);
        if (parts.length > 0) {
            messages.push({ role: 'user', content: parts });
        }
    }

    return {
        model: config.model,
        temperature: config.temperature,
        thinkingLevel: config.thinkingLevel,
        messages
    };
}

export const ModelConfigSchema = RawModelConfigSchema.transform(transformModelConfig);

// Input type (what the user writes)
export type RawModelConfig = z.input<typeof ModelConfigSchema>;

// Runtime type (what the app uses)
export type ModelConfig = z.output<typeof ModelConfigSchema>;

// For backward compatibility/aliases (if needed, but trying to remove)
export type BaseModelConfig = RawModelConfig;
export const BaseModelConfigSchema = RawModelConfigSchema;

/**
 * Merges a child config with a parent config, with the child taking precedence.
 */
export function mergeModelConfigs(child?: RawModelConfig, parent?: RawModelConfig): RawModelConfig {
    return {
        model: child?.model ?? parent?.model,
        temperature: child?.temperature ?? parent?.temperature,
        thinkingLevel: child?.thinkingLevel ?? parent?.thinkingLevel,
        system: child?.system ?? parent?.system,
        prompt: child?.prompt ?? parent?.prompt
    };
}

/**
 * Merges a child config with a parent config and transforms it into a ModelConfig.
 */
export function resolveModelConfig(child?: RawModelConfig, parent?: RawModelConfig): ModelConfig {
    return transformModelConfig(mergeModelConfigs(child, parent));
}
