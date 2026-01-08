import OpenAI from 'openai';
import { createLlmClient, CreateLlmClientParams } from "./createLlmClient.js";
import { createLlmRetryClient } from "./createLlmRetryClient.js";
import { createZodLlmClient } from "./createZodLlmClient.js";
import { createJsonSchemaLlmClient } from "./createJsonSchemaLlmClient.js";
import { wrapAsStateful } from "./createConversation.js";

export interface CreateLlmFactoryParams extends CreateLlmClientParams {
    // Optional overrides for specific sub-clients if needed, but usually just base params
}

export function createLlm(params: CreateLlmFactoryParams) {
    const baseClient = createLlmClient(params);
    
    const retryClient = createLlmRetryClient({
        prompt: baseClient.prompt,
        retryBaseDelay: params.retryBaseDelay
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
            return wrapAsStateful(base, initialMessages);
        }
    };
}

export type LlmClient = ReturnType<typeof createLlm>;
