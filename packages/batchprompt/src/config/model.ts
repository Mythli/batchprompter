import { z } from 'zod';

export type RawModel = {

}

export const PromptSchema = z.union([
    z.string(),
    z.array(z.any()) // ContentPart[]
]).describe("Prompt definition: string or ContentPart[]");

const createModelSchema = (dat) => {

}

export const RawModelConfigSchema = z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    system: PromptSchema.optional(),
    prompt: PromptSchema.optional()
})

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
