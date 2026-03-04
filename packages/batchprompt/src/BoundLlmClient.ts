import OpenAI from 'openai';
import { LlmClient, concatMessageText } from 'llm-fns';
import { z } from 'zod';

export interface PromptOptions {
    /** Content added BEFORE the stored messages */
    prefix?: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    /** Content added AFTER the stored messages */
    suffix?: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

export interface RequestOptions {
    headers?: Record<string, string>;
    timeout?: number;
    signal?: AbortSignal;
}

/**
 * An LLM client with pre-bound messages.
 */
export class BoundLlmClient {
    constructor(
        private client: LlmClient,
        private messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    ) {}

    /**
     * Combines stored messages with optional prefix/suffix.
     * Note: Prefix/Suffix are appended to the LAST user message if possible, or added as new user messages.
     * For simplicity here, we append them as new user messages.
     */
    private buildMessages(options?: PromptOptions): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        const finalMessages = [...this.messages];

        if (options?.prefix && options.prefix.length > 0) {
            // Insert prefix before the last message if it's a user message? 
            // Or just append? Usually suffix is what matters for "context + prompt".
            // Let's append prefix then suffix.
            finalMessages.push({ role: 'user', content: options.prefix });
        }

        if (options?.suffix && options.suffix.length > 0) {
            finalMessages.push({ role: 'user', content: options.suffix });
        }

        return finalMessages;
    }

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

    async promptText(): Promise<string>;
    async promptText(options: PromptOptions): Promise<string>;
    async promptText(options?: PromptOptions): Promise<string> {
        const messages = this.buildMessages(options);
        return this.client.promptText({ messages });
    }

    async prompt(params: {
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
        requestOptions?: RequestOptions;
        [key: string]: any;
    }): Promise<OpenAI.Chat.Completions.ChatCompletion> {
        return this.client.prompt(params);
    }

    getRawClient(): LlmClient {
        return this.client;
    }

    getMessages(): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        return this.messages;
    }
}
