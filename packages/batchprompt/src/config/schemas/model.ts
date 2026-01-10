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

export const ResolvedModelConfigSchema = RawModelConfigSchema.transform(transformModelConfig);

export type ModelConfig = z.input<typeof ResolvedModelConfigSchema>;
export type ResolvedModelConfig = z.output<typeof ResolvedModelConfigSchema>;

// For backward compatibility/aliases
export type BaseModelConfig = ModelConfig;
export type PluginModelConfig = ModelConfig;
export const BaseModelConfigSchema = RawModelConfigSchema;
export const ModelConfigSchema = RawModelConfigSchema;

/**
 * Merges a child config with a parent config, with the child taking precedence.
 */
export function mergeModelConfigs(child?: ModelConfig, parent?: ModelConfig): ModelConfig {
    return {
        model: child?.model ?? parent?.model,
        temperature: child?.temperature ?? parent?.temperature,
        thinkingLevel: child?.thinkingLevel ?? parent?.thinkingLevel,
        system: child?.system ?? parent?.system,
        prompt: child?.prompt ?? parent?.prompt
    };
}

/**
 * Merges a child config with a parent config and transforms it into a ResolvedModelConfig.
 */
export function resolveModelConfig(child?: ModelConfig, parent?: ModelConfig): ResolvedModelConfig {
    return transformModelConfig(mergeModelConfigs(child, parent));
}
