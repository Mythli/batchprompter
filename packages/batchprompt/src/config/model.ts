import {z} from 'zod';
import OpenAI from "openai";

export const PromptSchema = z.union([
    z.string(),
    z.array(z.any()) // ContentPart[]
]).describe("Prompt definition: string or ContentPart[]");

export const RawModelConfigSchema = z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    reasoning_effort: z.enum(['low', 'medium', 'high']).optional(),
    system: PromptSchema.optional(),
    prompt: PromptSchema.optional()
}).refine(data => data.system || data.prompt, {
    message: "no messages"
});

export type RawModel = z.infer<(typeof RawModelConfigSchema)>;

export function normalizePromptToParts(prompt: any): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
    if (!prompt) return [];
    if (Array.isArray(prompt)) return prompt;
    return [{type: 'text', text: prompt}];
}

export function transformModelConfig(config: z.infer<typeof RawModelConfigSchema>) {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    if (config.system) {
        const parts = normalizePromptToParts(config.system);
        const text = parts.map(p => p.type === 'text' ? p.text : '').join('\n');
        if (text) {
            messages.push({role: 'system', content: text});
        }
    }

    if (config.prompt) {
        const parts = normalizePromptToParts(config.prompt);
        if (parts.length > 0) {
            messages.push({role: 'user', content: parts});
        }
    }

    return {
        model: config.model,
        temperature: config.temperature,
        reasoning_effort: config.reasoning_effort,
        messages
    };
}

export const ModelConfigSchema = RawModelConfigSchema.transform(transformModelConfig);

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

/**
 * Merges two ModelConfig objects.
 * Override takes precedence, but messages are only overridden if the override has non-empty messages.
 */
export function mergeModels(base?: ModelConfig, override?: ModelConfig): ModelConfig | undefined {
    if (!base && !override) return undefined;
    if (!override) return base;
    if (!base) return override;
    return {
        ...base,
        ...override,
    };
}

/**
 * Merges two ModelConfig objects and ensures at least one is provided.
 * Throws an error if both base and override are undefined.
 * 
 * @param base - The base model configuration
 * @param override - The override model configuration
 * @param context - Optional context string for the error message (e.g., "queryModel", "selectModel")
 * @throws Error if both base and override are undefined
 */
export function requireModel(base?: ModelConfig, override?: ModelConfig, context?: string): ModelConfig {
    const result = mergeModels(base, override);
    if (!result) {
        const contextMsg = context ? ` for ${context}` : '';
        throw new Error(`Model configuration is required${contextMsg}, but none was provided.`);
    }
    return result;
}
