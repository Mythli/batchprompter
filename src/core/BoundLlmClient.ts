import OpenAI from 'openai';
import { LlmClient } from 'llm-fns';
import { z } from 'zod';

export interface PromptOptions {
    /** Content added BEFORE the stored promptParts */
    prefix?: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    /** Content added AFTER the stored promptParts */
    suffix?: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

export interface RequestOptions {
    headers?: Record<string, string>;
    timeout?: number;
    signal?: AbortSignal;
}

/**
 * An LLM client with pre-bound system and prompt parts.
 * This ensures prompts are never forgotten when calling the LLM.
 */
export class BoundLlmClient {
    constructor(
        private client: LlmClient,
        private systemParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        private promptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[]
    ) {}

    /**
     * Builds the messages array from stored parts and optional prefix/suffix.
     */
    private buildMessages(options?: PromptOptions): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

        // 1. System message
        if (this.systemParts.length > 0) {
            const content = this.flattenContent(this.systemParts);
            messages.push({ role: 'system', content: content as any });
        }

        // 2. User message: prefix + promptParts + suffix
        const userParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

        if (options?.prefix && options.prefix.length > 0) {
            userParts.push(...options.prefix);
        }

        if (this.promptParts.length > 0) {
            if (userParts.length > 0) {
                userParts.push({ type: 'text', text: '\n\n' });
            }
            userParts.push(...this.promptParts);
        }

        if (options?.suffix && options.suffix.length > 0) {
            if (userParts.length > 0) {
                userParts.push({ type: 'text', text: '\n\n' });
            }
            userParts.push(...options.suffix);
        }

        if (userParts.length > 0) {
            messages.push({ role: 'user', content: userParts });
        }

        return messages;
    }

    private flattenContent(
        parts: OpenAI.Chat.Completions.ChatCompletionContentPart[]
    ): string | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
        const allText = parts.every(p => p.type === 'text');
        if (allText) {
            return parts.map(p => (p as any).text).join('\n\n');
        }
        return parts;
    }

    /**
     * Call with Zod schema validation.
     */
    async promptZod<T>(schema: z.ZodType<T>): Promise<T>;
    async promptZod<T>(options: PromptOptions, schema: z.ZodType<T>): Promise<T>;
    async promptZod<T>(arg1: z.ZodType<T> | PromptOptions, arg2?: z.ZodType<T>): Promise<T> {
        let options: PromptOptions | undefined;
        let schema: z.ZodType<T>;

        if (arg2 !== undefined) {
            options = arg1 as PromptOptions;
            schema = arg2;
        } else {
            schema = arg1 as z.ZodType<T>;
        }

        const messages = this.buildMessages(options);
        return this.client.promptZod(messages, schema);
    }

    /**
     * Call with JSON schema validation.
     */
    async promptJson(schema: any): Promise<any>;
    async promptJson(options: PromptOptions, schema: any): Promise<any>;
    async promptJson(arg1: any, arg2?: any): Promise<any> {
        let options: PromptOptions | undefined;
        let schema: any;

        if (arg2 !== undefined) {
            options = arg1;
            schema = arg2;
        } else {
            schema = arg1;
        }

        const messages = this.buildMessages(options);
        return this.client.promptJson(messages, schema);
    }

    /**
     * Call for plain text response.
     */
    async promptText(): Promise<string>;
    async promptText(options: PromptOptions): Promise<string>;
    async promptText(options?: PromptOptions): Promise<string> {
        const messages = this.buildMessages(options);
        return this.client.promptText({ messages });
    }

    /**
     * Raw prompt call with full control over messages.
     * Useful for strategies that need to manage conversation history.
     */
    async prompt(params: { 
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
        requestOptions?: RequestOptions;
        [key: string]: any;
    }): Promise<any> {
        return this.client.prompt(params);
    }

    /**
     * Get the underlying raw LlmClient for advanced use cases.
     */
    getRawClient(): LlmClient {
        return this.client;
    }

    /**
     * Get the stored system parts.
     */
    getSystemParts(): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
        return this.systemParts;
    }

    /**
     * Get the stored prompt parts.
     */
    getPromptParts(): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
        return this.promptParts;
    }
}
