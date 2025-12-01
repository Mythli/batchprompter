import * as dotenv from 'dotenv';
import { z } from 'zod';
// import { createCache } from 'cache-manager';
import KeyvSqlite from '@keyv/sqlite';
import Keyv from 'keyv';
import OpenAI from "openai";
import { createLlm } from 'llm-fns';
import PQueue from 'p-queue';
import { ImageSearch } from './utils/ImageSearch.js';
import { AiImageSearch } from './utils/AiImageSearch.js';
import { createCachedFetcher } from './utils/createCachedFetcher.js';
import { DomainQueue } from './utils/DomainQueue.js';

dotenv.config();

// Helper to resolve environment variables with fallbacks
function getEnvVar(keys: string[]): string | undefined {
    for (const key of keys) {
        const value = process.env[key];
        if (value) return value;
    }
    return undefined;
}

export const configSchema = z.object({
    AI_API_KEY: z.string().min(1, "API Key is required. Checked: BATCHPROMPT_OPENAI_API_KEY, OPENAI_API_KEY, AI_API_KEY"),
    AI_API_URL: z.string().url().default("https://api.openai.com/v1"),
    MODEL: z.string().default("gpt-5.1"),
    GPT_MAX_CONVERSATION_CHARS: z.coerce.number().int().positive().optional(),
    CACHE_ENABLED: z.coerce.boolean().default(true),
    SQLITE_PATH: z.string().default(".cache.sqlite"),
    SERPER_API_KEY: z.string().optional(),
    TASK_CONCURRENCY: z.coerce.number().int().positive().default(100),
});

export type ConfigOverrides = {
    concurrency?: number;
};

export const initConfig = async (overrides: ConfigOverrides = {}) => {
    // Resolve values from multiple possible environment variable names
    const rawConfig = {
        ...process.env,
        AI_API_KEY: getEnvVar(['BATCHPROMPT_OPENAI_API_KEY', 'OPENAI_API_KEY', 'AI_API_KEY']),
        AI_API_URL: getEnvVar(['BATCHPROMPT_OPENAI_BASE_URL', 'OPENAI_BASE_URL', 'AI_API_URL']),
        MODEL: getEnvVar(['BATCHPROMPT_OPENAI_MODEL', 'OPENAI_MODEL', 'MODEL']),
        SERPER_API_KEY: getEnvVar(['BATCHPROMPT_SERPER_API_KEY', 'SERPER_API_KEY']),
        TASK_CONCURRENCY: getEnvVar(['BATCHPROMPT_TASK_CONCURRENCY', 'TASK_CONCURRENCY']),
    };

    const config = configSchema.parse(rawConfig);

    // Setup Cache
    let cache;
    if (config.CACHE_ENABLED) {
        cache = new Keyv({
            store: new KeyvSqlite(`sqlite://${config.SQLITE_PATH}`),
            serialize: JSON.stringify,
            deserialize: JSON.parse
        });
    }

    const openAi = new OpenAI({
        baseURL: config.AI_API_URL,
        apiKey: config.AI_API_KEY,
    });

    // Default to 1 if not specified in overrides, to be safe, or 10 if strictly internal.
    // Based on request, CLI defaults to 1.
    const gptQueue = new PQueue({ concurrency: overrides.concurrency ?? 1 });

    gptQueue.on('active', (a: any, b: any) => {
        console.log(`[Queue] Active. Pending: ${gptQueue.pending} | Queue: ${gptQueue.size}`);
    });

    gptQueue.on('completed', (result: any, a: any) => {
        const id = result?.id || 'unknown';
        console.log(`[Queue] Task completed (ID: ${id}). Pending: ${gptQueue.pending} | Queue: ${gptQueue.size}`);
    });

    gptQueue.on('error', (error, a: any, b: any) => {
        console.error(`[Queue] Task error:`, error);
    });

    const llm = createLlm({
        openai: openAi,
        defaultModel: config.MODEL,
        cache: cache,
        queue: gptQueue,
        maxConversationChars: config.GPT_MAX_CONVERSATION_CHARS,
    });

    let imageSearch: ImageSearch | undefined;
    let aiImageSearch: AiImageSearch | undefined;

    if (config.SERPER_API_KEY) {
        const domainQueue = new DomainQueue(5); // 5 concurrent requests per domain
        
        const cachedFetcher = createCachedFetcher({
            cache,
            prefix: 'fetch',
            ttl: 24 * 60 * 60 * 1000, // 24 hours
            timeout: 30000, // 30 seconds
            domainQueue,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        // Pass cache to ImageSearch for Serper results, and fetcher for downloads
        imageSearch = new ImageSearch(config.SERPER_API_KEY, cachedFetcher, cache);
        aiImageSearch = new AiImageSearch(imageSearch, llm);
    }

    return {
        config,
        llm,
        imageSearch,
        aiImageSearch
    };
}

export type TheConfig = Awaited<ReturnType<typeof initConfig>>;

let config: null | TheConfig = null;
export const getConfig = async (overrides?: ConfigOverrides) => {
    if(!config) {
        config = await initConfig(overrides);
    }
    return config;
}
