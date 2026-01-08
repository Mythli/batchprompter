import OpenAI from 'openai';
import { completionToMessage } from './completionToAssistantMessage.js';
import { createLlmClient, PromptFunction, CreateLlmClientParams, normalizeOptions } from './createLlmClient.js';
import { createLlmRetryClient } from './createLlmRetryClient.js';
import { createJsonSchemaLlmClient } from './createJsonSchemaLlmClient.js';
import { createZodLlmClient } from './createZodLlmClient.js';
import { extractImageBuffer, extractAudioBuffer } from './extractBinary.js';
import { createDnsFetcher } from './createDnsFetcher.js';

/**
 * Abstract interface for managing conversation history.
 */
export interface ConversationState {
    /** Returns a read-only copy of the current message history */
    getMessages(): OpenAI.Chat.Completions.ChatCompletionMessageParam[];

    /** Adds a raw message parameter to the history */
    add(message: OpenAI.Chat.Completions.ChatCompletionMessageParam): void;

    /** Normalizes and adds a full completion to the history as an assistant message */
    addCompletion(completion: OpenAI.Chat.Completions.ChatCompletion): void;

    /** Shorthand to add a user message. Supports strings, parts, or completions (forced to user role). */
    addUserMessage(content: string | OpenAI.Chat.Completions.ChatCompletionContentPart[] | OpenAI.Chat.Completions.ChatCompletion): void;

    /** Shorthand to add an assistant message. Supports strings, null, or completions. */
    addAssistantMessage(content: string | null | OpenAI.Chat.Completions.ChatCompletion): void;

    /** Adds binary content to the history. */
    addBinary(type: 'image' | 'audio', buffer: Buffer, role?: 'user' | 'assistant', mimeType?: string): void;

    /** Removes the last N messages from the history */
    pop(count?: number): OpenAI.Chat.Completions.ChatCompletionMessageParam[];

    /** Clears all messages */
    clear(): void;
}

/**
 * Creates a simple in-memory implementation of ConversationState.
 */
export function createConversationState(initialMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []): ConversationState {
    let messages = [...initialMessages];

    const add = (m: OpenAI.Chat.Completions.ChatCompletionMessageParam) => messages.push(m);

    const addCompletion = (completion: OpenAI.Chat.Completions.ChatCompletion) => {
        add(completionToMessage(completion));
    };

    const addUserMessage = (content: string | OpenAI.Chat.Completions.ChatCompletionContentPart[] | OpenAI.Chat.Completions.ChatCompletion) => {
        if (content && typeof content === 'object' && 'choices' in (content as any)) {
            const msg = completionToMessage(content as OpenAI.Chat.Completions.ChatCompletion);
            add({ ...msg, role: 'user' } as any);
        } else {
            add({ role: 'user', content: content as any });
        }
    };

    const addAssistantMessage = (content: string | null | OpenAI.Chat.Completions.ChatCompletion) => {
        if (content && typeof content === 'object' && 'choices' in (content as any)) {
            addCompletion(content as OpenAI.Chat.Completions.ChatCompletion);
        } else {
            add({ role: 'assistant', content: content as any });
        }
    };

    const addBinary = (type: 'image' | 'audio', buffer: Buffer, role: 'user' | 'assistant' = 'user', mimeType?: string) => {
        const content: any[] = [];
        if (type === 'image') {
            const mime = mimeType || 'image/png';
            content.push({
                type: 'image_url',
                image_url: { url: `data:${mime};base64,${buffer.toString('base64')}` }
            });
        } else {
            content.push({
                type: 'input_audio',
                input_audio: {
                    data: buffer.toString('base64'),
                    format: (mimeType as any) || 'wav'
                }
            });
        }
        add({ role, content } as any);
    };

    return {
        getMessages: () => [...messages],
        add,
        addCompletion,
        addUserMessage,
        addAssistantMessage,
        addBinary,
        pop: (count = 1) => messages.splice(-count),
        clear: () => { messages = []; }
    };
}

/**
 * Creates a stateful conversation client.
 * Every call to a prompt method will:
 * 1. Capture the normalized user message(s) from the first call of the turn.
 * 2. Execute the call using the full history from the state.
 * 3. Capture the final assistant response and append it to the state.
 */
export function createConversation(params: CreateLlmClientParams, initialMessages?: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) {
    const state = createConversationState(initialMessages);
    const baseClient = createLlmClient(params);
    const fetchImpl = params.fetch ?? createDnsFetcher();

    const wrapMethod = (methodName: string) => {
        return async (...args: any[]) => {
            let firstCall = true;
            let lastCompletion: OpenAI.Chat.Completions.ChatCompletion | undefined;

            const spyPrompt: PromptFunction = async (arg1: any, arg2?: any) => {
                const options = normalizeOptions(arg1, arg2);
                
                const history = state.getMessages();
                if (firstCall) {
                    // Capture new messages from the high-level caller (e.g. normalized Zod prompts)
                    for (const m of options.messages) state.add(m);
                    firstCall = false;
                }

                // Execute with history injected
                const result = await baseClient.prompt({
                    ...options,
                    messages: [...history, ...options.messages]
                });

                lastCompletion = result;
                return result;
            };

            // Re-assemble a temporary client using the spyPrompt
            const retryClient = createLlmRetryClient({
                prompt: spyPrompt,
                retryBaseDelay: params.retryBaseDelay,
                fetch: params.fetch
            });

            const jsonSchemaClient = createJsonSchemaLlmClient({
                prompt: spyPrompt,
                retryBaseDelay: params.retryBaseDelay
            });

            const zodClient = createZodLlmClient({
                jsonSchemaClient
            });

            const tempClient: any = {
                prompt: spyPrompt,
                promptText: async (arg1: any, arg2?: any) => {
                    const res = await spyPrompt(arg1, arg2);
                    return res.choices[0]?.message?.content!;
                },
                promptImage: async (arg1: any, arg2?: any) => {
                    const res = await spyPrompt(arg1, arg2);
                    return extractImageBuffer(res, fetchImpl);
                },
                promptAudio: async (arg1: any, arg2?: any) => {
                    const res = await spyPrompt(arg1, arg2);
                    return extractAudioBuffer(res);
                },
                ...retryClient,
                ...jsonSchemaClient,
                ...zodClient
            };

            // Execute the requested method on the temp client
            const result = await tempClient[methodName](...args);

            // Commit the last completion to history
            if (lastCompletion) {
                state.addCompletion(lastCompletion);
            }

            return result;
        };
    };

    return {
        ...state,
        prompt: wrapMethod('prompt'),
        promptText: wrapMethod('promptText'),
        promptImage: wrapMethod('promptImage'),
        promptAudio: wrapMethod('promptAudio'),
        promptRetry: wrapMethod('promptRetry'),
        promptTextRetry: wrapMethod('promptTextRetry'),
        promptImageRetry: wrapMethod('promptImageRetry'),
        promptAudioRetry: wrapMethod('promptAudioRetry'),
        promptJson: wrapMethod('promptJson'),
        promptZod: wrapMethod('promptZod'),
    };
}
