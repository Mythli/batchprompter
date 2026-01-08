import crypto from 'crypto';
import OpenAI from "openai";
import type PQueue from 'p-queue';
import { executeWithRetry } from './retryUtils.js';
import { truncateMessages, getPromptSummary } from './util.js';
import { extractImageBuffer, extractAudioBuffer } from './extractBinary.js';
import { createDnsFetcher } from './createDnsFetcher.js';

export class LlmFatalError extends Error {
    constructor(
        message: string,
        public readonly cause?: any,
        public readonly messages?: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        public readonly rawResponse?: string | null
    ) {
        super(message);
        this.name = 'LlmFatalError';
        this.cause = cause;
    }
}

/**
 * The response format for OpenAI and OpenRouter.
 * OpenRouter extends this with 'json_schema'.
 */
export type ModelConfig = string | ({ model?: string } & Record<string, any>);

export type OpenRouterResponseFormat =
    | { type: 'text' | 'json_object' }
    | {
    type: 'json_schema';
    json_schema: {
        name: string;
        strict?: boolean;
        schema: object;
    };
};

/**
 * Request-level options passed to the OpenAI SDK.
 * These are separate from the body parameters.
 */
export interface LlmRequestOptions {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeout?: number;
}

/**
 * Merges two LlmRequestOptions objects.
 * Headers are merged (override wins on conflict), other properties are replaced.
 */
export function mergeRequestOptions(
    base?: LlmRequestOptions,
    override?: LlmRequestOptions
): LlmRequestOptions | undefined {
    if (!base && !override) return undefined;
    if (!base) return override;
    if (!override) return base;

    return {
        ...base,
        ...override,
        headers: {
            ...base.headers,
            ...override.headers
        }
    };
}

/**
 * Common options shared by all prompt functions.
 * Does NOT include messages - those are handled separately.
 */
export interface LlmCommonOptions {
    model?: ModelConfig;
    retries?: number;
    retryBaseDelay?: number;
    /** @deprecated Use `reasoning` object instead. */
    response_format?: OpenRouterResponseFormat;
    modalities?: string[];
    audio?: OpenAI.Chat.Completions.ChatCompletionAudioParam;
    image_config?: {
        aspect_ratio?: string;
    };
    requestOptions?: LlmRequestOptions;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    stop?: string | string[];
    reasoning_effort?: 'low' | 'medium' | 'high';
    seed?: number;
    user?: string;
    tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
    tool_choice?: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption;
}

/**
 * Options for the individual "prompt" function calls.
 * Allows messages as string or array for convenience.
 */
export interface LlmPromptOptions extends LlmCommonOptions {
    messages: string | OpenAI.Chat.Completions.ChatCompletionMessageParam[];
}

/**
 * Internal normalized params - messages is always an array.
 */
export interface LlmPromptParams extends LlmCommonOptions {
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
}

/**
 * Options required to create an instance of the LlmClient.
 * These are the core dependencies.
 */
export interface CreateLlmClientParams {
    openai: OpenAI;
    defaultModel: ModelConfig;
    maxConversationChars?: number;
    queue?: PQueue;
    defaultRequestOptions?: LlmRequestOptions;
    retryBaseDelay?: number;
    /** Optional custom fetch implementation for binary extraction */
    fetch?: typeof globalThis.fetch;
}

/**
 * Normalizes input arguments to LlmPromptParams.
 * Handles string shorthand and messages-as-string.
 */
export function normalizeOptions(
    arg1: string | LlmPromptOptions,
    arg2?: LlmCommonOptions
): LlmPromptParams {
    if (typeof arg1 === 'string') {
        return {
            messages: [{ role: 'user', content: arg1 }],
            ...arg2
        };
    }
    const options = arg1;
    if (typeof options.messages === 'string') {
        return {
            ...options,
            messages: [{ role: 'user', content: options.messages }]
        };
    }
    return options as LlmPromptParams;
}

/**
 * Factory function that creates a GPT "prompt" function.
 * @param params - The core dependencies (API key, base URL, default model).
 * @returns An async function `prompt` ready to make OpenAI calls.
 */
export function createLlmClient(params: CreateLlmClientParams) {
    const {
        openai,
        defaultModel: factoryDefaultModel,
        maxConversationChars,
        queue,
        defaultRequestOptions,
        retryBaseDelay: factoryRetryBaseDelay = 1000,
        fetch: factoryFetch
    } = params;

    const fetchImpl = factoryFetch ?? createDnsFetcher();

    const getCompletionParams = (promptParams: LlmPromptParams) => {
        const {
            model: callSpecificModel,
            messages,
            retries,
            retryBaseDelay: callSpecificRetryBaseDelay,
            requestOptions,
            ...restApiOptions
        } = promptParams;

        const finalMessages = maxConversationChars
            ? truncateMessages(messages, maxConversationChars)
            : messages;

        const baseConfig = typeof factoryDefaultModel === 'object' && factoryDefaultModel !== null
            ? factoryDefaultModel
            : (typeof factoryDefaultModel === 'string' ? { model: factoryDefaultModel } : {});

        const overrideConfig = typeof callSpecificModel === 'object' && callSpecificModel !== null
            ? callSpecificModel
            : (typeof callSpecificModel === 'string' ? { model: callSpecificModel } : {});

        const modelConfig = { ...baseConfig, ...overrideConfig };

        const { model: modelToUse, ...modelParams } = modelConfig;

        if (typeof modelToUse !== 'string' || !modelToUse) {
            throw new Error('A model must be specified either in the default configuration or in the prompt options.');
        }

        const completionParams = {
            ...modelParams,
            model: modelToUse,
            messages: finalMessages,
            ...restApiOptions,
        };

        const mergedRequestOptions = mergeRequestOptions(defaultRequestOptions, requestOptions);

        return { 
            completionParams, 
            modelToUse, 
            finalMessages, 
            retries, 
            requestOptions: mergedRequestOptions,
            retryBaseDelay: callSpecificRetryBaseDelay ?? factoryRetryBaseDelay
        };
    };

    async function prompt(content: string, options?: LlmCommonOptions): Promise<OpenAI.Chat.Completions.ChatCompletion>;
    async function prompt(options: LlmPromptOptions): Promise<OpenAI.Chat.Completions.ChatCompletion>;
    async function prompt(arg1: string | LlmPromptOptions, arg2?: LlmCommonOptions): Promise<OpenAI.Chat.Completions.ChatCompletion> {
        const promptParams = normalizeOptions(arg1, arg2);
        const { completionParams, finalMessages, retries, requestOptions, retryBaseDelay: baseDelay } = getCompletionParams(promptParams);

        const promptSummary = getPromptSummary(finalMessages);

        const apiCall = async (): Promise<OpenAI.Chat.Completions.ChatCompletion> => {
            const task = () => executeWithRetry<OpenAI.Chat.Completions.ChatCompletion, OpenAI.Chat.Completions.ChatCompletion>(
                async () => {
                    try {
                        return await openai.chat.completions.create(
                            completionParams as any,
                            requestOptions
                        );
                    } catch (error: any) {
                        if (error?.status === 400 || error?.status === 401 || error?.status === 403) {
                            throw new LlmFatalError(error.message || 'Fatal API Error', error, finalMessages);
                        }
                        throw error;
                    }
                },
                async (completion) => {
                    if(!completion) {
                        throw new Error('Completion is undefined, something is fishy.');
                    }

                    if((completion as any).error) {
                      throw new Error(`LLM Provider Error: ${(completion as any).error.message}`);
                    }

                    return { isValid: true, data: completion };
                },
                retries ?? 3,
                undefined,
                (error: any) => {
                    if (error instanceof LlmFatalError) return false;
                    if (error?.status === 400 || error?.status === 401 || error?.status === 403 || error?.code === 'invalid_api_key') {
                        return false;
                    }
                    return true;
                },
                baseDelay
            );

            const response = (await (queue ? queue.add(task, { id: promptSummary, messages: finalMessages } as any) : task())) as OpenAI.Chat.Completions.ChatCompletion;
            return response;
        };

        return apiCall();
    }

    async function promptText(content: string, options?: LlmCommonOptions): Promise<string>;
    async function promptText(options: LlmPromptOptions): Promise<string>;
    async function promptText(arg1: string | LlmPromptOptions, arg2?: LlmCommonOptions): Promise<string> {
        const promptParams = normalizeOptions(arg1, arg2);
        const response = await prompt(promptParams);
        const content = response.choices[0]?.message?.content;
        if (content === null || content === undefined) {
            throw new Error("LLM returned no text content.");
        }
        return content;
    }

    async function promptImage(content: string, options?: LlmCommonOptions): Promise<Buffer>;
    async function promptImage(options: LlmPromptOptions): Promise<Buffer>;
    async function promptImage(arg1: string | LlmPromptOptions, arg2?: LlmCommonOptions): Promise<Buffer> {
        const promptParams = normalizeOptions(arg1, arg2);
        const response = await prompt(promptParams);
        return extractImageBuffer(response, fetchImpl);
    }

    async function promptAudio(content: string, options?: LlmCommonOptions): Promise<Buffer>;
    async function promptAudio(options: LlmPromptOptions): Promise<Buffer>;
    async function promptAudio(arg1: string | LlmPromptOptions, arg2?: LlmCommonOptions): Promise<Buffer> {
        const promptParams = normalizeOptions(arg1, arg2);

        // Ensure modalities includes audio if not explicitly set, though user should ideally provide it.
        // We won't force it here to avoid overriding user intent, but promptAudio implies audio output.

        const response = await prompt(promptParams);
        return extractAudioBuffer(response);
    }

    return { prompt, promptText, promptImage, promptAudio };
}

export type PromptFunction = ReturnType<typeof createLlmClient>['prompt'];
export type PromptTextFunction = ReturnType<typeof createLlmClient>['promptText'];
export type PromptImageFunction = ReturnType<typeof createLlmClient>['promptImage'];
export type PromptAudioFunction = ReturnType<typeof createLlmClient>['promptAudio'];
