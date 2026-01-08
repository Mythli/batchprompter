import OpenAI from 'openai';
import { completionToMessage } from './completionToAssistantMessage.js';
import { CreateLlmClientParams } from './createLlmClient.js';
import { createLlm, LlmClient } from './llmFactory.js';
import { concatSystemContent } from './util.js';

/**
 * Abstract interface for managing conversation history.
 * System messages are explicitly excluded from the conversation history.
 */
export interface ConversationState {
    /** Returns a read-only copy of the current message history (excluding system messages) */
    getMessages(): OpenAI.Chat.Completions.ChatCompletionMessageParam[];

    /** Returns the initial system messages */
    getSystemMessages(): OpenAI.Chat.Completions.ChatCompletionMessageParam[];

    /** Adds a raw message parameter to the history. System messages are ignored. */
    add(message: OpenAI.Chat.Completions.ChatCompletionMessageParam): void;

    /** Normalizes and adds a full completion to the history as an assistant message */
    addCompletion(completion: OpenAI.Chat.Completions.ChatCompletion): void;

    /** Shorthand to add a user message. Supports strings or content parts. */
    addUserMessage(content: string | OpenAI.Chat.Completions.ChatCompletionContentPart[]): void;

    /** Shorthand to add an assistant message. Supports strings, content parts, or null. */
    addAssistantMessage(content: string | OpenAI.Chat.Completions.ChatCompletionContentPart[] | null): void;

    /** Removes the last N messages from the history */
    pop(count?: number): OpenAI.Chat.Completions.ChatCompletionMessageParam[];

    /** Clears all messages */
    clear(): void;
}

/**
 * Creates a simple in-memory implementation of ConversationState.
 * Filters out system messages from initial input and prevents them from being added.
 */
export function createConversationState(initialMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []): ConversationState {
    const systemMessages = initialMessages.filter(m => m.role === 'system');
    let messages = initialMessages.filter(m => m.role !== 'system');

    const add = (m: OpenAI.Chat.Completions.ChatCompletionMessageParam) => {
        if (m.role !== 'system') {
            messages.push(m);
        }
    };

    const addCompletion = (completion: OpenAI.Chat.Completions.ChatCompletion) => {
        add(completionToMessage(completion));
    };

    const addUserMessage = (content: string | OpenAI.Chat.Completions.ChatCompletionContentPart[]) => {
        add({ role: 'user', content: content as any });
    };

    const addAssistantMessage = (content: string | OpenAI.Chat.Completions.ChatCompletionContentPart[] | null) => {
        add({ role: 'assistant', content: content as any });
    };

    return {
        getMessages: () => [...messages],
        getSystemMessages: () => [...systemMessages],
        add,
        addCompletion,
        addUserMessage,
        addAssistantMessage,
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
 * 
 * System messages are used for the duration of a call but are never stored in history.
 */
export function createConversation(params: CreateLlmClientParams, initialMessages?: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) {
    const state = createConversationState(initialMessages);

    // Turn-specific tracking state
    let isFirstCallInTurn = true;
    let turnInitialMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    let lastCompletionInTurn: OpenAI.Chat.Completions.ChatCompletion | undefined;

    /**
     * Low-level SDK Spy.
     * Intercepts every call to OpenAI to inject history and manage system messages.
     */
    const spiedOpenAi = {
        ...params.openai,
        chat: {
            ...params.openai.chat,
            completions: {
                ...params.openai.chat.completions,
                create: async (createParams: any, createOptions: any) => {
                    const incomingMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = createParams.messages;

                    if (isFirstCallInTurn) {
                        // Capture the "clean" prompt messages from the start of the turn (excluding system)
                        turnInitialMessages = incomingMessages.filter(m => m.role !== 'system');
                        isFirstCallInTurn = false;
                    }

                    const historyMessages = state.getMessages();
                    const baseSystemMessages = state.getSystemMessages();
                    
                    const callSystemMessages = incomingMessages.filter(m => m.role === 'system');
                    const currentWithoutSystem = incomingMessages.filter(m => m.role !== 'system');

                    // Combine all system messages (initial + call-specific)
                    // We cast to the expected type because TS infers a wider type for content (including Refusal parts)
                    // from the generic ChatCompletionMessageParam, but we know system messages are compatible.
                    const finalSystemContent = concatSystemContent([
                        ...baseSystemMessages.map(m => m.content),
                        ...callSystemMessages.map(m => m.content)
                    ] as (string | OpenAI.Chat.Completions.ChatCompletionContentPart[] | null | undefined)[]);

                    let finalSystemMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam | undefined;
                    if (finalSystemContent) {
                        finalSystemMessage = { role: 'system', content: finalSystemContent as any };
                    }

                    // Rebuild the full message array for the actual SDK call
                    const finalMessages = finalSystemMessage 
                        ? [finalSystemMessage, ...historyMessages, ...currentWithoutSystem]
                        : [...historyMessages, ...currentWithoutSystem];

                    const result = await params.openai.chat.completions.create({
                        ...createParams,
                        messages: finalMessages
                    }, createOptions);

                    lastCompletionInTurn = result as any;
                    return result;
                }
            }
        }
    } as unknown as OpenAI;

    // Create a standard LLM client using the spied OpenAI instance
    const client = createLlm({
        ...params,
        openai: spiedOpenAi
    });

    /**
     * High-level Turn Wrapper.
     * Defines the boundaries of a single user interaction.
     */
    const wrapMethod = (methodName: string) => {
        const originalMethod = (client as any)[methodName];
        if (typeof originalMethod !== 'function') return originalMethod;
        
        return async (...args: any[]) => {
            // Reset turn context
            isFirstCallInTurn = true;
            turnInitialMessages = [];
            lastCompletionInTurn = undefined;

            const result = await originalMethod.apply(client, args);

            // Turn finished successfully. Commit the turn to the long-term history.
            for (const m of turnInitialMessages) {
                state.add(m);
            }

            if (lastCompletionInTurn) {
                state.addCompletion(lastCompletionInTurn);
            }

            return result;
        };
    };

    // Wrap all high-level methods to ensure they are treated as stateful turns
    const wrappedMethods = Object.fromEntries(
        Object.keys(client)
            .filter(key => key !== 'createConversation')
            .map(key => [key, wrapMethod(key)])
    );

    return {
        ...state,
        ...wrappedMethods
    } as ConversationState & typeof wrappedMethods;
}
