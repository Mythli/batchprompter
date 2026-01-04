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
export declare class BoundLlmClient {
    private client;
    private systemParts;
    private promptParts;
    constructor(client: LlmClient, systemParts: OpenAI.Chat.Completions.ChatCompletionContentPart[], promptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[]);
    /**
     * Builds the messages array from stored parts and optional prefix/suffix.
     */
    private buildMessages;
    private flattenContent;
    /**
     * Call with Zod schema validation.
     */
    promptZod<T>(schema: z.ZodType<T>): Promise<T>;
    promptZod<T>(options: PromptOptions, schema: z.ZodType<T>): Promise<T>;
    /**
     * Call with JSON schema validation.
     */
    promptJson(schema: any): Promise<any>;
    promptJson(options: PromptOptions, schema: any): Promise<any>;
    /**
     * Call for plain text response.
     */
    promptText(): Promise<string>;
    promptText(options: PromptOptions): Promise<string>;
    /**
     * Raw prompt call with full control over messages.
     * Useful for strategies that need to manage conversation history.
     */
    prompt(params: {
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
        requestOptions?: RequestOptions;
        [key: string]: any;
    }): Promise<any>;
    /**
     * Get the underlying raw LlmClient for advanced use cases.
     */
    getRawClient(): LlmClient;
    /**
     * Get the stored system parts.
     */
    getSystemParts(): OpenAI.Chat.Completions.ChatCompletionContentPart[];
    /**
     * Get the stored prompt parts.
     */
    getPromptParts(): OpenAI.Chat.Completions.ChatCompletionContentPart[];
}
//# sourceMappingURL=BoundLlmClient.d.ts.map