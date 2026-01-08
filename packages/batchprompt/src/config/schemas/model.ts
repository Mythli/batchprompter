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
 * The final resolved model configuration used at runtime.
 */
export interface ResolvedModelConfig {
    model?: string;
    temperature?: number;
    thinkingLevel?: 'low' | 'medium' | 'high';
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
}

/**
 * Transforms a raw model config into a resolved one with messages.
 */
export function transformModelConfig(config: z.infer<typeof RawModelConfigSchema>): ResolvedModelConfig {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    if (config.system) {
        const parts = normalizePromptToParts(config.system);
        // System messages in OpenAI are typically text. 
        // If parts contains images, this might be invalid for 'system' role in some APIs, 
        // but we'll flatten text parts for now or pass as is if the API supports it.
        // For safety, we join text parts.
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

// For backward compatibility with imports, though we are changing usage
export const BaseModelConfigSchema = RawModelConfigSchema;
export const ModelConfigSchema = RawModelConfigSchema; // Defaults handled in inheritance logic
