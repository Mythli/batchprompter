import OpenAI from 'openai';
import { completionToMessage } from './completionToAssistantMessage.js';
import { normalizeOptions, LlmPromptOptions, LlmCommonOptions } from './createLlmClient.js';
import { normalizeZodArgs, ZodLlmClientOptions } from './createZodLlmClient.js';
import { ZodTypeAny, z } from 'zod';

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
 * Wraps a stateless LLM client to make it stateful.
 * Every call to a prompt method will:
 * 1. Append the new user message(s) to the state.
 * 2. Execute the call using the full history from the state.
 * 3. Append the assistant's response to the state.
 */
export function wrapAsStateful<T extends Record<string, any>>(client: T, state: ConversationState): T & ConversationState {
    const wrapped: any = {
        ...state
    };

    const ingestResult = (methodName: string, result: any) => {
        if (result && typeof result === 'object' && 'choices' in result) {
            state.addCompletion(result);
        } else if (typeof result === 'string') {
            state.addAssistantMessage(result);
        } else if (Buffer.isBuffer(result)) {
            const isImage = methodName.toLowerCase().includes('image');
            state.addBinary(isImage ? 'image' : 'audio', result, 'assistant');
        } else if (result !== undefined && result !== null) {
            // Likely JSON/Zod result or other object
            state.addAssistantMessage(typeof result === 'object' ? JSON.stringify(result) : String(result));
        }
    };

    // Wrap standard prompt methods
    const standardMethods = ['prompt', 'promptText', 'promptImage', 'promptAudio', 'promptRetry', 'promptTextRetry', 'promptImageRetry', 'promptAudioRetry'];
    
    for (const methodName of standardMethods) {
        if (typeof client[methodName] === 'function') {
            wrapped[methodName] = async (arg1: any, arg2: any) => {
                const params = normalizeOptions(arg1, arg2);
                
                // Add new messages to state
                for (const m of params.messages) state.add(m);

                const result = await client[methodName]({
                    ...params,
                    messages: state.getMessages()
                });

                ingestResult(methodName, result);

                return result;
            };
        }
    }

    // Wrap Structured Output methods
    if (typeof client.promptJson === 'function') {
        wrapped.promptJson = async (messagesOrSchema: any, schemaOrOptions: any, options?: any) => {
            let finalMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
            let schema: Record<string, any>;
            let callOptions: any;

            if (Array.isArray(messagesOrSchema)) {
                finalMessages = messagesOrSchema;
                schema = schemaOrOptions;
                callOptions = options;
            } else {
                finalMessages = [{ role: 'user', content: 'Generate structured data.' }];
                schema = messagesOrSchema;
                callOptions = schemaOrOptions;
            }

            for (const m of finalMessages) state.add(m);

            const result = await client.promptJson(state.getMessages(), schema, callOptions);
            ingestResult('promptJson', result);
            return result;
        };
    }

    if (typeof client.promptZod === 'function') {
        wrapped.promptZod = async (arg1: any, arg2?: any, arg3?: any, arg4?: any) => {
            const { messages, dataExtractionSchema, options } = normalizeZodArgs(arg1, arg2, arg3, arg4);
            
            for (const m of messages) state.add(m);

            const result = await client.promptZod(state.getMessages(), dataExtractionSchema, options);
            ingestResult('promptZod', result);
            return result;
        };
    }

    return wrapped as T & ConversationState;
}
