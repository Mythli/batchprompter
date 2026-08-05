import crypto from 'crypto';
import OpenAI from "openai";
import type PQueue from 'p-queue';
import { executeWithRetry } from './retryUtils.js';
import { truncateMessages, getPromptSummary } from './util.js';
import { extractImageBuffer, extractAudioBuffer, extractAudioDeltaData } from './extractBinary.js';
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

export type LlmAudioTransport = 'auto' | 'chat' | 'chat-stream';

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
    /**
     * Selects how audio output is requested. `auto` prefers streaming because
     * OpenRouter audio output requires it, then falls back to non-streaming chat
     * if streaming is rejected by the provider.
     */
    audioTransport?: LlmAudioTransport;
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
    reasoning_effort?: 'low' | 'medium' | 'high' | 'max';
    seed?: number;
    user?: string;
    tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
    tool_choice?: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption;
    stream_options?: OpenAI.Chat.Completions.ChatCompletionStreamOptions;
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

    const getErrorMessage = (error: any): string => [
        error?.message,
        error?.cause?.message,
        error?.error?.message,
        error?.cause?.error?.message,
        error?.response?.data?.error?.message
    ].filter(Boolean).join('\n');

    const isStreamingUnsupportedError = (error: any): boolean => {
        const message = getErrorMessage(error);
        return /stream(ing)?\s+(is\s+)?not\s+supported|does\s+not\s+support\s+stream|stream\s+unsupported/i.test(message);
    };

    const withAudioOutputDefaults = (
        promptParams: LlmPromptParams,
        defaultFormat: OpenAI.Chat.Completions.ChatCompletionAudioParam['format']
    ): LlmPromptParams => {
        const factoryModelConfig = typeof factoryDefaultModel === 'object' && factoryDefaultModel !== null
            ? factoryDefaultModel
            : {};
        const callModelConfig = typeof promptParams.model === 'object' && promptParams.model !== null
            ? promptParams.model
            : {};
        const nextModalities = [
            ...((factoryModelConfig as any).modalities ?? []),
            ...((callModelConfig as any).modalities ?? []),
            ...(promptParams.modalities ?? [])
        ];
        if (!nextModalities.includes('text')) nextModalities.push('text');
        if (!nextModalities.includes('audio')) nextModalities.push('audio');

        return {
            ...promptParams,
            modalities: [...new Set(nextModalities)],
            audio: {
                voice: 'alloy',
                format: defaultFormat,
                ...((factoryModelConfig as any).audio ?? {}),
                ...((callModelConfig as any).audio ?? {}),
                ...(promptParams.audio ?? {})
            }
        };
    };

    const getCompletionParams = (promptParams: LlmPromptParams) => {
        const {
            model: callSpecificModel,
            messages,
            retries,
            retryBaseDelay: callSpecificRetryBaseDelay,
            requestOptions,
            audioTransport: _audioTransport,
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
        const normalizedParams = normalizeOptions(arg1, arg2);
        const transport = normalizedParams.audioTransport ?? 'auto';

        if (transport === 'chat') {
            const response = await prompt(withAudioOutputDefaults(normalizedParams, 'mp3'));
            return extractAudioBuffer(response);
        }

        const streamParams = withAudioOutputDefaults(normalizedParams, 'pcm16');

        try {
            return await promptAudioViaChatStream(streamParams);
        } catch (error: any) {
            if (transport === 'auto' && isStreamingUnsupportedError(error)) {
                const response = await prompt(withAudioOutputDefaults(normalizedParams, 'mp3'));
                return extractAudioBuffer(response);
            }
            throw error;
        }
    }

    function promptAudioStream(content: string, options?: LlmCommonOptions): AsyncIterable<Buffer>;
    function promptAudioStream(options: LlmPromptOptions): AsyncIterable<Buffer>;
    async function* promptAudioStream(arg1: string | LlmPromptOptions, arg2?: LlmCommonOptions): AsyncIterable<Buffer> {
        const promptParams = withAudioOutputDefaults(normalizeOptions(arg1, arg2), 'pcm16');
        const { completionParams, finalMessages, retries, requestOptions, retryBaseDelay: baseDelay } = getCompletionParams(promptParams);

        const promptSummary = getPromptSummary(finalMessages);
        const streamParams = {
            ...completionParams,
            stream: true
        };

        type StreamEvent =
            | { type: 'chunk'; chunk: Buffer }
            | { type: 'error'; error: unknown }
            | { type: 'done' };

        const streamEvents: StreamEvent[] = [];
        let wakeConsumer: (() => void) | undefined;

        const pushStreamEvent = (event: StreamEvent) => {
            streamEvents.push(event);
            wakeConsumer?.();
            wakeConsumer = undefined;
        };

        const nextStreamEvent = async (): Promise<StreamEvent> => {
            while (streamEvents.length === 0) {
                await new Promise<void>(resolve => {
                    wakeConsumer = resolve;
                });
            }
            return streamEvents.shift() as StreamEvent;
        };

        let emittedChunkCount = 0;

        async function readStream(): Promise<number> {
            let chunkCount = 0;
            try {
                const stream = await openai.chat.completions.create(
                    streamParams as any,
                    requestOptions
                ) as any;

                for await (const chunk of stream) {
                    const audioData = extractAudioDeltaData(chunk);
                    if (audioData) {
                        chunkCount += 1;
                        emittedChunkCount += 1;
                        pushStreamEvent({ type: 'chunk', chunk: Buffer.from(audioData, 'base64') });
                    }
                }
                return chunkCount;
            } catch (error: any) {
                if (error?.status === 400 || error?.status === 401 || error?.status === 403) {
                    throw new LlmFatalError(error.message || 'Fatal API Error', error, finalMessages);
                }
                throw error;
            }
        }

        const task = () => executeWithRetry<number, number>(
            () => readStream(),
            async (chunkCount) => {
                if (chunkCount === 0) {
                    return {
                        isValid: false,
                        feedbackForNextAttempt: {
                            type: 'EMPTY_AUDIO_STREAM',
                            message: 'LLM returned no streamed audio content.'
                        }
                    };
                }
                return { isValid: true, data: chunkCount };
            },
            retries ?? 3,
            undefined,
            (error: any) => {
                if (emittedChunkCount > 0) return false;
                if (error instanceof LlmFatalError) return false;
                if (error?.status === 400 || error?.status === 401 || error?.status === 403 || error?.code === 'invalid_api_key') {
                    return false;
                }
                return true;
            },
            baseDelay
        );

        const producer = (queue
            ? queue.add(task, { id: promptSummary, messages: finalMessages } as any)
            : task()) as Promise<number>;

        producer
            .then(() => pushStreamEvent({ type: 'done' }))
            .catch(error => pushStreamEvent({ type: 'error', error }));

        while (true) {
            const event = await nextStreamEvent();
            if (event.type === 'chunk') {
                yield event.chunk;
            } else if (event.type === 'error') {
                throw event.error;
            } else {
                break;
            }
        }
    }

    async function promptAudioViaChatStream(promptParams: LlmPromptParams): Promise<Buffer> {
        const chunks: Buffer[] = [];
        for await (const chunk of promptAudioStream(promptParams)) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    }

    return { prompt, promptText, promptImage, promptAudio, promptAudioStream };
}

export type PromptFunction = ReturnType<typeof createLlmClient>['prompt'];
export type PromptTextFunction = ReturnType<typeof createLlmClient>['promptText'];
export type PromptImageFunction = ReturnType<typeof createLlmClient>['promptImage'];
export type PromptAudioFunction = ReturnType<typeof createLlmClient>['promptAudio'];
export type PromptAudioStreamFunction = ReturnType<typeof createLlmClient>['promptAudioStream'];
