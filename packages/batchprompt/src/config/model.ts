import {z} from 'zod';
import OpenAI from "openai";

export const PromptSchema = z.union([
    z.string(),
    z.array(z.any()) // ContentPart[]
]).describe("Prompt definition: string or ContentPart[]");

export const RawModelConfigSchema = z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    reasoning_effort: z.enum(['low', 'medium', 'high', 'max']).optional(),
    thinkingLevel: z.enum(['low', 'medium', 'high', 'max']).optional(),
    modalities: z.array(z.string()).optional(),
    audio: z.object({
        voice: z.string().optional(),
        format: z.enum(['wav', 'aac', 'mp3', 'flac', 'opus', 'pcm16']).optional()
    }).passthrough().optional(),
    audioTransport: z.enum(['auto', 'chat', 'chat-stream']).optional(),
    system: PromptSchema.optional(),
    prompt: PromptSchema.optional()
});

export type RawModel = z.infer<(typeof RawModelConfigSchema)>;

export interface ModelConfig {
    model?: string;
    temperature?: number;
    reasoning_effort?: 'low' | 'medium' | 'high' | 'max';
    modalities?: string[];
    audio?: {
        voice?: string;
        format?: 'wav' | 'aac' | 'mp3' | 'flac' | 'opus' | 'pcm16';
        [key: string]: unknown;
    };
    audioTransport?: 'auto' | 'chat' | 'chat-stream';
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
}

export function normalizePromptToParts(prompt: any): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
    if (!prompt) return [];
    if (Array.isArray(prompt)) return prompt;
    return [{type: 'text', text: prompt}];
}

export function transformModelConfig(config: z.infer<typeof RawModelConfigSchema>): ModelConfig {
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

    // Resolve thinkingLevel → reasoning_effort (thinkingLevel is the user-facing name)
    const reasoning_effort = config.reasoning_effort ?? config.thinkingLevel;

    return {
        model: config.model,
        temperature: config.temperature,
        reasoning_effort,
        modalities: config.modalities,
        audio: config.audio,
        audioTransport: config.audioTransport,
        messages
    };
}

export const ModelConfigSchema = RawModelConfigSchema.transform(transformModelConfig);

/**
 * Merges two ModelConfig objects.
 * Override takes precedence, but undefined values in the override do not overwrite defined values in the base.
 * Messages are only overridden if the override has non-empty messages.
 */
export function mergeModels(base?: ModelConfig, override?: ModelConfig): ModelConfig | undefined {
    if (!base && !override) return undefined;
    if (!override) return base;
    if (!base) return override;
    
    return {
        model: override.model ?? base.model,
        temperature: override.temperature ?? base.temperature,
        reasoning_effort: override.reasoning_effort ?? base.reasoning_effort,
        modalities: override.modalities ?? base.modalities,
        audio: override.audio ?? base.audio,
        audioTransport: override.audioTransport ?? base.audioTransport,
        messages: override.messages && override.messages.length > 0 ? override.messages : base.messages,
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
