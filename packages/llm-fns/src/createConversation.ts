import OpenAI from 'openai';
import { completionToMessage } from './completionToAssistantMessage.js';
import { createLlmClient, PromptFunction, CreateLlmClientParams, normalizeOptions } from './createLlmClient.js';
import { createLlmRetryClient } from './createLlmRetryClient.js';
import { createJsonSchemaLlmClient } from './createJsonSchemaLlmClient.js';
import { createZodLlmClient } from './createZodLlmClient.js';

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
 */
export function createConversationState(initialMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []): ConversationState {
    let messages = [...initialMessages];

    const add = (m: OpenAI.Chat.Completions.ChatCompletionMessageParam) => messages.push(m);

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
 */
export function createConversation(params: CreateLlmClientParams, initialMessages?: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) {
    const state = createConversationState(initialMessages);
    const baseClient = createLlmClient(params);

    /**
     * Assembles a full suite of LLM methods around a specific prompt function.
     */
    const assembleStatefulTurnClient = (prompt: PromptFunction) => {
        const retryClient = createLlmRetryClient({
            prompt,
            retryBaseDelay: params.retryBaseDelay,
            fetch: params.fetch
        });

        const jsonSchemaClient = createJsonSchemaLlmClient({
            prompt,
            retryBaseDelay: params.retryBaseDelay
        });

        const zodClient = createZodLlmClient({
            jsonSchemaClient
        });

        return {
            ...baseClient,
            ...retryClient,
            ...jsonSchemaClient,
            ...zodClient,
            prompt,
        };
    };

    const wrapMethod = (methodName: string) => {
        return async (...args: any[]) => {
            let firstCall = true;
            let turnInitialMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
            let turnSystemMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam | undefined;
            let lastCompletion: OpenAI.Chat.Completions.ChatCompletion | undefined;

            const spyPrompt: PromptFunction = async (arg1: any, arg2?: any) => {
                const options = normalizeOptions(arg1, arg2);

                if (firstCall) {
                    // Capture the "clean" prompt messages from the start of the turn
                    turnSystemMessage = options.messages.find(m => m.role === 'system');
                    turnInitialMessages = options.messages.filter(m => m.role !== 'system');
                    firstCall = false;
                }

                const historyMessages = state.getMessages();
                
                // Determine which system message to use (new one overrides old one)
                const systemToUse = turnSystemMessage || historyMessages.find(m => m.role === 'system');
                
                const historyWithoutSystem = historyMessages.filter(m => m.role !== 'system');
                const turnMessagesWithoutSystem = options.messages.filter(m => m.role !== 'system');

                // Rebuild the full message array for the LLM call
                const finalMessages = systemToUse 
                    ? [systemToUse, ...historyWithoutSystem, ...turnMessagesWithoutSystem]
                    : [...historyWithoutSystem, ...turnMessagesWithoutSystem];

                const result = await baseClient.prompt({
                    ...options,
                    messages: finalMessages
                });

                lastCompletion = result;
                return result;
            };

            const tempClient: any = assembleStatefulTurnClient(spyPrompt);
            const result = await tempClient[methodName](...args);

            // Turn finished successfully. Commit the turn to the long-term history.
            if (turnSystemMessage) {
                // Replace system message in state and keep it at the top
                const history = state.getMessages().filter(m => m.role !== 'system');
                state.clear();
                state.add(turnSystemMessage);
                for (const m of history) state.add(m);
            }

            for (const m of turnInitialMessages) {
                state.add(m);
            }

            if (lastCompletion) {
                state.addCompletion(lastCompletion);
            }

            return result;
        };
    };

    // Dynamically wrap all methods from the turn client
    const dummyPrompt: any = () => {};
    const turnClientMethods = assembleStatefulTurnClient(dummyPrompt);
    const wrappedMethods = Object.fromEntries(
        Object.keys(turnClientMethods).map(name => [name, wrapMethod(name)])
    );

    return {
        ...state,
        ...wrappedMethods
    } as ConversationState & typeof turnClientMethods;
}
