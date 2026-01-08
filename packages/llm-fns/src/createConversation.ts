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

    /** Shorthand to add a user message */
    addUserMessage(content: string | OpenAI.Chat.Completions.ChatCompletionContentPart[]): void;

    /** Shorthand to add an assistant message */
    addAssistantMessage(content: string | null): void;

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

    return {
        getMessages: () => [...messages],
        add: (m) => messages.push(m),
        addUserMessage: (content) => messages.push({ role: 'user', content }),
        addAssistantMessage: (content) => messages.push({ role: 'assistant', content }),
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

                // Add result to state
                if (methodName.includes('Text')) {
                    state.addAssistantMessage(result as string);
                } else if (methodName.includes('Image') || methodName.includes('Audio')) {
                    state.addAssistantMessage(`[Binary Content: ${methodName.includes('Image') ? 'Image' : 'Audio'}]`);
                } else {
                    // For raw prompt/promptRetry, result is ChatCompletion
                    state.add(completionToMessage(result as OpenAI.Chat.Completions.ChatCompletion));
                }

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
            state.addAssistantMessage(JSON.stringify(result));
            return result;
        };
    }

    if (typeof client.promptZod === 'function') {
        wrapped.promptZod = async (arg1: any, arg2?: any, arg3?: any, arg4?: any) => {
            const { messages, dataExtractionSchema, options } = normalizeZodArgs(arg1, arg2, arg3, arg4);
            
            for (const m of messages) state.add(m);

            const result = await client.promptZod(state.getMessages(), dataExtractionSchema, options);
            state.addAssistantMessage(JSON.stringify(result));
            return result;
        };
    }

    return wrapped as T & ConversationState;
}
