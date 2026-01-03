import OpenAI from 'openai';
import { PromptDef } from './types.js';
import { ContentResolver } from '../core/io/ContentResolver.js';

/**
 * Loads and converts prompt definitions to OpenAI content parts
 */
export class PromptLoader {
    private cache = new Map<string, OpenAI.Chat.Completions.ChatCompletionContentPart[]>();

    constructor(private contentResolver: ContentResolver) {}

    async load(prompt: PromptDef | undefined | null): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        if (!prompt) {
            return [];
        }

        if (typeof prompt === 'string') {
            return this.loadString(prompt);
        }

        if (prompt.file) {
            return this.loadString(prompt.file);
        }

        if (prompt.text) {
            return [{ type: 'text', text: prompt.text }];
        }

        if (prompt.parts) {
            return this.loadParts(prompt.parts);
        }

        return [];
    }

    private async loadString(input: string): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        if (this.cache.has(input)) {
            return this.cache.get(input)!;
        }

        const result = await this.contentResolver.resolve(input);
        this.cache.set(input, result);
        return result;
    }

    private async loadParts(
        parts: { type: 'text' | 'image' | 'audio'; content: string }[]
    ): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        const result: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

        for (const part of parts) {
            if (part.type === 'text') {
                const loaded = await this.loadString(part.content);
                result.push(...loaded);
            } else if (part.type === 'image') {
                if (part.content.startsWith('data:') || part.content.startsWith('http')) {
                    result.push({
                        type: 'image_url',
                        image_url: { url: part.content }
                    });
                } else {
                    const loaded = await this.loadString(part.content);
                    result.push(...loaded);
                }
            } else if (part.type === 'audio') {
                if (part.content.startsWith('data:')) {
                    const match = part.content.match(/^data:audio\/(\w+);base64,(.+)$/);
                    if (match) {
                        result.push({
                            type: 'input_audio',
                            input_audio: { data: match[2], format: match[1] as 'mp3' | 'wav' }
                        });
                    }
                } else {
                    const loaded = await this.loadString(part.content);
                    result.push(...loaded);
                }
            }
        }

        return result;
    }

    clearCache(): void {
        this.cache.clear();
    }
}
