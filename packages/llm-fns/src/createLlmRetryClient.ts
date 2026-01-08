import OpenAI from 'openai';
import { 
    PromptFunction, 
    LlmCommonOptions, 
    LlmPromptOptions, 
    normalizeOptions,
    LlmFatalError
} from "./createLlmClient.js";
import { completionToMessage } from './completionToAssistantMessage.js';
import { ConversationState } from './createConversation.js';
import { extractImageBuffer, extractAudioBuffer } from './extractBinary.js';
import { createDnsFetcher } from './createDnsFetcher.js';

export class LlmRetryError extends Error {
    constructor(
        public readonly message: string,
        public readonly type: 'JSON_PARSE_ERROR' | 'CUSTOM_ERROR',
        public readonly details?: any,
        public readonly rawResponse?: string | null,
    ) {
        super(message);
        this.name = 'LlmRetryError';
    }
}

export class LlmRetryExhaustedError extends Error {
    constructor(
        public readonly message: string,
        options?: ErrorOptions
    ) {
        super(message, options);
        this.name = 'LlmRetryExhaustedError';
    }
}

export class LlmRetryAttemptError extends Error {
    constructor(
        public readonly message: string,
        public readonly mode: 'main' | 'fallback',
        public readonly conversation: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        public readonly attemptNumber: number,
        public readonly error: Error,
        public readonly rawResponse?: string | null,
        options?: ErrorOptions
    ) {
        super(message, options);
        this.name = 'LlmRetryAttemptError';
    }
}

export interface LlmRetryResponseInfo {
    mode: 'main' | 'fallback';
    conversation: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    attemptNumber: number;
}

/**
 * Options for retry prompt functions.
 * Extends common options with retry-specific settings.
 */
export interface LlmRetryOptions<T = any> extends LlmCommonOptions {
    maxRetries?: number;
    validate?: (response: OpenAI.Chat.Completions.ChatCompletion, info: LlmRetryResponseInfo) => Promise<T>;
    /** Optional conversation state to maintain history across retries */
    state?: ConversationState;
}

/**
 * Internal params for retry functions - always has messages array.
 */
interface LlmRetryParams<T = any> extends LlmRetryOptions<T> {
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
}

export interface CreateLlmRetryClientParams {
    prompt: PromptFunction;
    fallbackPrompt?: PromptFunction;
    retryBaseDelay?: number;
    /** Optional custom fetch implementation for binary extraction */
    fetch?: typeof globalThis.fetch;
}

function normalizeRetryOptions<T>(
    arg1: string | LlmPromptOptions,
    arg2?: LlmRetryOptions<T>
): LlmRetryParams<T> {
    const baseParams = normalizeOptions(arg1, arg2);
    return {
        ...baseParams,
        ...arg2,
        messages: baseParams.messages
    };
}

function constructLlmMessages(
    initialMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    attemptNumber: number,
    previousError?: LlmRetryAttemptError
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    if (attemptNumber === 0) {
        return initialMessages;
    }

    if (!previousError) {
        throw new Error("Invariant violation: previousError is missing for a retry attempt.");
    }
    
    const cause = previousError.error;

    if (!(cause instanceof LlmRetryError)) {
        throw Error('cause must be an instanceof LlmRetryError')
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [...previousError.conversation];

    messages.push({ role: "user", content: cause.message });

    return messages;
}

export function createLlmRetryClient(params: CreateLlmRetryClientParams) {
    const { prompt, fallbackPrompt, retryBaseDelay: factoryRetryBaseDelay = 0, fetch: factoryFetch } = params;

    const fetchImpl = factoryFetch ?? createDnsFetcher();

    async function runPromptLoop<T>(
        retryParams: LlmRetryParams<T>
    ): Promise<T> {
        const { 
            maxRetries = 3, 
            validate, 
            messages: initialMessages, 
            retryBaseDelay = factoryRetryBaseDelay, 
            state,
            ...restOptions 
        } = retryParams;

        let lastError: LlmRetryAttemptError | undefined;

        // If state is provided, initialize it with initial messages if it's empty
        if (state && state.getMessages().length === 0) {
            for (const m of initialMessages) state.add(m);
        }

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            if (attempt > 0 && retryBaseDelay > 0) {
                const backoffTime = retryBaseDelay * Math.pow(2, attempt - 1);
                const jitter = backoffTime * (Math.random() * 0.2);
                const totalDelay = backoffTime + jitter;
                await new Promise(resolve => setTimeout(resolve, totalDelay));
            }

            const useFallback = !!fallbackPrompt && attempt > 0;
            const currentPrompt = useFallback ? fallbackPrompt! : prompt;
            const mode = useFallback ? 'fallback' : 'main';

            // If we have state, we add the previous error message to it
            if (attempt > 0 && state && lastError) {
                state.add({ role: 'user', content: lastError.error.message });
            }

            const currentMessages = state 
                ? state.getMessages() 
                : constructLlmMessages(initialMessages, attempt, lastError);

            // Capture raw response for error context
            let rawResponseForError: string | null = null;

            try {
                const completion = await currentPrompt({
                    messages: currentMessages,
                    ...restOptions,
                });

                // Extract raw content immediately
                rawResponseForError = completion.choices[0]?.message?.content || null;

                // Normalize the message using the shared utility
                const assistantMessage = completionToMessage(completion);
                
                if (state) {
                    state.add(assistantMessage);
                }

                const finalConversation = state ? state.getMessages() : [...currentMessages, assistantMessage];

                const info: LlmRetryResponseInfo = {
                    mode,
                    conversation: finalConversation,
                    attemptNumber: attempt,
                };

                if (validate) {
                    return await validate(completion, info);
                }

                return completion as unknown as T;

            } catch (error: any) {
                if (error instanceof LlmRetryError) {
                    const conversationForError = state ? state.getMessages() : [...currentMessages];
                    
                    if (!state) {
                        if (error.rawResponse) {
                            conversationForError.push({ role: 'assistant', content: error.rawResponse });
                        } else if (rawResponseForError) {
                            conversationForError.push({ role: 'assistant', content: rawResponseForError });
                        }
                    }

                    lastError = new LlmRetryAttemptError(
                        `Attempt ${attempt + 1} failed: ${error.message}`,
                        mode,
                        conversationForError, 
                        attempt,
                        error,
                        error.rawResponse || rawResponseForError,
                        { cause: lastError }
                    );
                } else {
                    const fatalMessage = error.message || 'An unexpected error occurred during LLM execution';
                    const cause = error instanceof LlmFatalError ? error.cause : error;
                    const responseContent = rawResponseForError || (error as any).rawResponse || null;

                    throw new LlmFatalError(
                        fatalMessage,
                        cause,
                        currentMessages,
                        responseContent
                    );
                }
            }
        }

        throw new LlmRetryExhaustedError(
            `Operation failed after ${maxRetries + 1} attempts.`,
            { cause: lastError }
        );
    }

    async function promptRetry<T = OpenAI.Chat.Completions.ChatCompletion>(
        content: string,
        options?: LlmRetryOptions<T>
    ): Promise<T>;
    async function promptRetry<T = OpenAI.Chat.Completions.ChatCompletion>(
        options: LlmPromptOptions & LlmRetryOptions<T>
    ): Promise<T>;
    async function promptRetry<T = OpenAI.Chat.Completions.ChatCompletion>(
        arg1: string | (LlmPromptOptions & LlmRetryOptions<T>),
        arg2?: LlmRetryOptions<T>
    ): Promise<T> {
        const retryParams = normalizeRetryOptions<T>(arg1, arg2);
        return runPromptLoop(retryParams);
    }

    async function promptTextRetry<T = string>(
        content: string,
        options?: LlmRetryOptions<T>
    ): Promise<T>;
    async function promptTextRetry<T = string>(
        options: LlmPromptOptions & LlmRetryOptions<T>
    ): Promise<T>;
    async function promptTextRetry<T = string>(
        arg1: string | (LlmPromptOptions & LlmRetryOptions<T>),
        arg2?: LlmRetryOptions<T>
    ): Promise<T> {
        const retryParams = normalizeRetryOptions<T>(arg1, arg2);
        const userValidate = retryParams.validate;

        retryParams.validate = async (completion, info) => {
            const content = completion.choices[0]?.message?.content;
            if (content === null || content === undefined) {
                throw new LlmRetryError("LLM returned no text content.", 'CUSTOM_ERROR', undefined, JSON.stringify(completion));
            }
            
            if (userValidate) {
                return await userValidate(completion, info);
            }
            
            return content as unknown as T;
        };

        return runPromptLoop(retryParams);
    }

    async function promptImageRetry<T = Buffer>(
        content: string,
        options?: LlmRetryOptions<T>
    ): Promise<T>;
    async function promptImageRetry<T = Buffer>(
        options: LlmPromptOptions & LlmRetryOptions<T>
    ): Promise<T>;
    async function promptImageRetry<T = Buffer>(
        arg1: string | (LlmPromptOptions & LlmRetryOptions<T>),
        arg2?: LlmRetryOptions<T>
    ): Promise<T> {
        const retryParams = normalizeRetryOptions<T>(arg1, arg2);
        const userValidate = retryParams.validate;

        retryParams.validate = async (completion, info) => {
            try {
                const buffer = await extractImageBuffer(completion, fetchImpl);
                if (userValidate) {
                    return await userValidate(completion, info);
                }
                return buffer as unknown as T;
            } catch (e: any) {
                throw new LlmRetryError(e.message || "LLM returned no image content.", 'CUSTOM_ERROR', undefined, JSON.stringify(completion));
            }
        };

        return runPromptLoop(retryParams);
    }

    async function promptAudioRetry<T = Buffer>(
        content: string,
        options?: LlmRetryOptions<T>
    ): Promise<T>;
    async function promptAudioRetry<T = Buffer>(
        options: LlmPromptOptions & LlmRetryOptions<T>
    ): Promise<T>;
    async function promptAudioRetry<T = Buffer>(
        arg1: string | (LlmPromptOptions & LlmRetryOptions<T>),
        arg2?: LlmRetryOptions<T>
    ): Promise<T> {
        const retryParams = normalizeRetryOptions<T>(arg1, arg2);
        const userValidate = retryParams.validate;

        retryParams.validate = async (completion, info) => {
            try {
                const buffer = extractAudioBuffer(completion);
                if (userValidate) {
                    return await userValidate(completion, info);
                }
                return buffer as unknown as T;
            } catch (e: any) {
                throw new LlmRetryError(e.message || "LLM returned no audio content.", 'CUSTOM_ERROR', undefined, JSON.stringify(completion));
            }
        };

        return runPromptLoop(retryParams);
    }

    return { promptRetry, promptTextRetry, promptImageRetry, promptAudioRetry };
}

export type LlmRetryClient = ReturnType<typeof createLlmRetryClient>;
