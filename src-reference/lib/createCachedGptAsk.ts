import crypto from 'crypto';
import OpenAI from "openai";
import { Cache } from 'cache-manager'; // Using Cache from cache-manager

/**
 * The response format for OpenAI and OpenRouter.
 * OpenRouter extends this with 'json_schema'.
 */
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
 * Options for the individual "ask" function calls.
 * These can override defaults or add call-specific parameters.
 * 'messages' is a required property, inherited from OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming.
 */
export interface GptAskOptions extends Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, 'model' | 'response_format'> {
    model?: string;    // Allow overriding the default model for a specific call
    ttl?: number;      // Cache TTL in *MILLISECONDS* for this specific call, used if cache is enabled
    reasoning?: { [key: string]: any }; // For OpenRouter reasoning tokens
    /** @deprecated Use `reasoning` object instead. */
    reasoning_effort?: 'low' | 'medium' | 'high'; // Legacy param, will be transformed to `reasoning`
    response_format?: OpenRouterResponseFormat;
}

/**
 * Options required to create an instance of the gptAsk function.
 * These are the core dependencies.
 */
export interface CreateCachedGptAskParams {
    apiKey: string;
    baseURL: string;
    cache?: Cache; // Cache instance is now optional. Expect a cache-manager compatible instance if provided.
    defaultModel: string; // The default OpenAI model to use if not overridden in GptAskOptions
}

/**
 * Factory function that creates a GPT "ask" function, with optional caching.
 * @param params - The core dependencies (API key, base URL, default model, and optional cache instance).
 * @returns An async function `gptAsk` ready to make OpenAI calls, with caching if configured.
 */
export function createCachedGptAsk(params: CreateCachedGptAskParams) {
    const { apiKey, baseURL, cache: cacheInstance, defaultModel: factoryDefaultModel } = params;

    // Create an OpenAI client instance using the provided apiKey and baseURL.
    // This client is bound to the returned 'gptAsk' function via closure.
    const openAi = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: "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",
        defaultHeaders: {
            "HTTP-Referer": "<YOUR_SITE_URL>", // Optional. Site URL for rankings on openrouter.ai.
            "X-Title": "<YOUR_SITE_NAME>", // Optional. Site title for rankings on openrouter.ai.
        },
    });

    // This is the actual function that will be returned and used for making calls.
    // It closes over 'openAi', 'cacheInstance', and 'factoryDefaultModel'.
    return async function gptAsk(
        options: GptAskOptions // Options are now non-optional, 'messages' is guaranteed by GptAskOptions.
    ): Promise<string | null> {

        // Destructure options for this specific call:
        const { ttl, model: callSpecificModel, messages, reasoning_effort, ...restApiOptions } = options;

        // Handle legacy `reasoning_effort` and merge with any existing `reasoning` options.
        if (reasoning_effort) {
            restApiOptions.reasoning = {
                effort: reasoning_effort,
                ...restApiOptions.reasoning, // Preserve other reasoning settings if they exist
            };
        }

        // Determine the model to use for this API call:
        const modelToUse = callSpecificModel || factoryDefaultModel;

        // Prepare parameters for the OpenAI API call.
        const completionParams = {
            model: modelToUse,
            messages: messages,
            // Default to disabling reasoning. This can be overridden by a `reasoning` property in `options`.
            reasoning: { enabled: false },
            ...restApiOptions, // Spread all other relevant OpenAI options
        };

        let cacheKey: string | undefined;

        // --- Cache Logic (if cacheInstance is provided) ---
        if (cacheInstance) {
            // The cache key must be unique for the combination of:
            // model, messages, and any other API-affecting options.
            const cacheKeyString = JSON.stringify(completionParams);
            cacheKey = `gptask:${crypto.createHash('md5').update(cacheKeyString).digest('hex')}`;

            // 1. Check cache
            try {
                const cachedResponse = await cacheInstance.get<string>(cacheKey);
                if (cachedResponse !== undefined && cachedResponse !== null) { // cache-manager specific check
                    // console.info(`Cache hit for key: ${cacheKey}`); // Optional: for debugging
                    return cachedResponse;
                }
                // console.info(`Cache miss for key: ${cacheKey}`); // Optional: for debugging
            } catch (error) {
                console.warn("Cache get error:", error);
                // Proceed to API call if cache read fails, treating it as a cache miss.
            }
        }

        // --- API Call ---
        // If cache miss, no cache configured, or cache read error, make the API call.
        // We cast to `any` because the OpenAI SDK type doesn't include OpenRouter-specific params like `reasoning`.
        const completion = await openAi.chat.completions.create(completionParams as any);
        const responseContent = completion.choices[0]?.message?.content;

        // --- Store in cache (if cache is configured, response is valid, and cacheKey was generated) ---
        if (cacheInstance && responseContent && cacheKey) {
            // Default TTL is 24 hours (in ms) if not specified in 'options.ttl' for this call.
            // This TTL is only used if caching is active.
            const actualTtlMs = ttl ?? (60 * 60 * 24 * 1000);
            try {
                await cacheInstance.set(cacheKey, responseContent, actualTtlMs);
                // console.info(`Cache set for key: ${cacheKey} with TTL (ms): ${actualTtlMs}`); // Optional: for debugging
            } catch (error) {
                console.warn("Cache set error:", error);
                // If cache set fails, the API response is still returned to the caller.
            }
        }
        return responseContent || null;
    };
}

export type AskGptFunction = ReturnType<typeof createCachedGptAsk>;
