import * as dotenv from 'dotenv';
import { z } from 'zod';
import { createCache } from 'cache-manager';
import KeyvSqlite from '@keyv/sqlite';
import OpenAI from "openai";
import { createCachedGptAsk } from "./createCachedGptAsk.js";
import { EventTracker } from "./EventTracker.js";
import PQueue from 'p-queue';
dotenv.config();
// Helper to resolve environment variables with fallbacks
function getEnvVar(keys) {
    for (const key of keys) {
        const value = process.env[key];
        if (value)
            return value;
    }
    return undefined;
}
export const configSchema = z.object({
    AI_API_KEY: z.string().min(1, "API Key is required. Checked: BATCHPROMPT_OPENAI_API_KEY, OPENAI_API_KEY, AI_API_KEY"),
    AI_API_URL: z.string().url().default("https://api.openai.com/v1"),
    MODEL: z.string().default("gpt-5.1"),
    GPT_MAX_CONVERSATION_CHARS: z.coerce.number().int().positive().optional(),
    CACHE_ENABLED: z.coerce.boolean().default(false),
    SQLITE_PATH: z.string().default("cache.sqlite"),
});
export const initConfig = async (overrides = {}) => {
    // Resolve values from multiple possible environment variable names
    const rawConfig = {
        ...process.env,
        AI_API_KEY: getEnvVar(['BATCHPROMPT_OPENAI_API_KEY', 'OPENAI_API_KEY', 'AI_API_KEY']),
        AI_API_URL: getEnvVar(['BATCHPROMPT_OPENAI_BASE_URL', 'OPENAI_BASE_URL', 'AI_API_URL']),
        MODEL: getEnvVar(['BATCHPROMPT_OPENAI_MODEL', 'OPENAI_MODEL', 'MODEL']),
    };
    const config = configSchema.parse(rawConfig);
    // Setup Cache
    let cache;
    if (config.CACHE_ENABLED) {
        const sqliteStore = new KeyvSqlite(`sqlite://${config.SQLITE_PATH}`);
        cache = createCache({ stores: [sqliteStore] });
    }
    const eventTracker = new EventTracker();
    eventTracker.startPerformanceLogging('GPT-Runner');
    const openAi = new OpenAI({
        baseURL: config.AI_API_URL,
        apiKey: config.AI_API_KEY,
    });
    // Default to 1 if not specified in overrides, to be safe, or 10 if strictly internal.
    // Based on request, CLI defaults to 1.
    const gptQueue = new PQueue({ concurrency: overrides.concurrency ?? 1 });
    const gptAskFns = createCachedGptAsk({
        openai: openAi,
        defaultModel: config.MODEL,
        cache: cache,
        eventTracker,
        maxConversationChars: config.GPT_MAX_CONVERSATION_CHARS,
        queue: gptQueue,
    });
    return {
        config,
        ask: gptAskFns.ask,
        isAskCached: gptAskFns.isAskCached,
        eventTracker
    };
};
let config = null;
export const getConfig = async (overrides) => {
    if (!config) {
        config = await initConfig(overrides);
    }
    return config;
};
