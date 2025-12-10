import OpenAI from 'openai';
import { LlmClient } from 'llm-fns';
import { ResolvedModelConfig } from '../types.js';
import { ModelRequestNormalizer } from './ModelRequestNormalizer.js';

export class ConfiguredLlmClient {
    constructor(
        private baseClient: LlmClient,
        private config: ResolvedModelConfig
    ) {}

    async prompt(
        row: Record<string, any>,
        additionalMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [],
        externalContent?: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        cacheSalt?: string | number
    ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
        
        const request = ModelRequestNormalizer.normalize(this.config, row, externalContent);
        
        // Merge additional messages (e.g. history)
        // Insert them after system prompt if present
        const finalMessages = [...request.messages];
        const systemIndex = finalMessages.findIndex(m => m.role === 'system');
        
        if (additionalMessages.length > 0) {
            if (systemIndex >= 0) {
                finalMessages.splice(systemIndex + 1, 0, ...additionalMessages);
            } else {
                finalMessages.unshift(...additionalMessages);
            }
        }

        return this.baseClient.prompt({
            messages: finalMessages,
            model: request.model,
            ...request.options,
            cacheSalt
        } as any);
    }

    async promptJson(
        row: Record<string, any>,
        schema: any,
        additionalMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [],
        externalContent?: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        cacheSalt?: string | number
    ): Promise<any> {
        const request = ModelRequestNormalizer.normalize(this.config, row, externalContent);
        
        const finalMessages = [...request.messages];
        const systemIndex = finalMessages.findIndex(m => m.role === 'system');
        
        if (additionalMessages.length > 0) {
            if (systemIndex >= 0) {
                finalMessages.splice(systemIndex + 1, 0, ...additionalMessages);
            } else {
                finalMessages.unshift(...additionalMessages);
            }
        }

        return this.baseClient.promptJson(
            finalMessages,
            schema,
            {
                model: request.model,
                ...request.options,
                cacheSalt
            }
        );
    }

    async promptZod<T>(
        row: Record<string, any>,
        zodSchema: any, // Zod schema
        additionalMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [],
        externalContent?: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        cacheSalt?: string | number
    ): Promise<T> {
        const request = ModelRequestNormalizer.normalize(this.config, row, externalContent);
        
        const finalMessages = [...request.messages];
        const systemIndex = finalMessages.findIndex(m => m.role === 'system');
        
        if (additionalMessages.length > 0) {
            if (systemIndex >= 0) {
                finalMessages.splice(systemIndex + 1, 0, ...additionalMessages);
            } else {
                finalMessages.unshift(...additionalMessages);
            }
        }

        return this.baseClient.promptZod(
            finalMessages,
            zodSchema,
            {
                model: request.model,
                ...request.options,
                cacheSalt
            }
        );
    }
}
