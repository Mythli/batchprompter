import { z } from 'zod';
import OpenAI from "openai";

export const PromptSchema = z.union([
    z.string(),
    z.array(z.any()) // ContentPart[]
]).describe("Prompt definition: string or ContentPart[]");

export const RawModelConfigSchema = z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    system: PromptSchema.optional(),
    prompt: PromptSchema.optional()
}).refine(data => data.system || data.prompt, {
    message: "no messages"
});

export type RawModel = z.infer<(typeof RawModelConfigSchema)>;

export function normalizePromptToParts(prompt: any): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
    if (!prompt) return [];
    if (Array.isArray(prompt)) return prompt;
    return [{ type: 'text', text: prompt }];
}

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
