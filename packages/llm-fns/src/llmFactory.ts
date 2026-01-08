import OpenAI from 'openai';
import { createLlmClient, CreateLlmClientParams } from "./createLlmClient.js";
import { createLlmRetryClient } from "./createLlmRetryClient.js";
import { createZodLlmClient } from "./createZodLlmClient.js";
import { createJsonSchemaLlmClient } from "./createJsonSchemaLlmClient.js";
import { createConversation } from "./createConversation.js";

export type CreateLlmFactoryParams = CreateLlmClientParams;

export function createLlm(params: CreateLlmFactoryParams) {
    const baseClient = createLlmClient(params);
    
    const retryClient = createLlmRetryClient({
        prompt: baseClient.prompt,
        retryBaseDelay: params.retryBaseDelay,
        fetch: params.fetch
    });

    const jsonSchemaClient = createJsonSchemaLlmClient({
        prompt: baseClient.prompt,
        retryBaseDelay: params.retryBaseDelay
    });

    const zodClient = createZodLlmClient({
        jsonSchemaClient
    });

    const base = {
        ...baseClient,
        ...retryClient,
        ...jsonSchemaClient,
        ...zodClient
    };

    return {
        ...base,
        /**
         * Creates a stateful conversation client that automatically maintains history.
         */
        createConversation: (initialMessages?: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) => {
            return createConversation(params, initialMessages);
        }
    };
}

export type LlmClient = ReturnType<typeof createLlm>;
