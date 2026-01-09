import { z } from 'zod';
import KeyvSqlite from '@keyv/sqlite';
import Keyv from 'keyv';
import OpenAI from "openai";
import PQueue from 'p-queue';
import { ImageSearch } from './plugins/image-search/ImageSearch.js';
import { WebSearch } from './plugins/web-search/WebSearch.js';
import { createPluginRegistry } from './plugins/index.js';
import { PuppeteerHelper } from './utils/puppeteer/PuppeteerHelper.js';
import { createAiLoggingFetcher, createCachedFetcher, createLlm } from "llm-fns";
import { GlobalContext } from './types.js';
import { ServiceCapabilities, ModelConfig } from './config/types.js';
import { LlmClientFactory } from './LlmClientFactory.js';
import { attachQueueLogger } from "./debug/queue.js";
import { LlmFactory } from './plugins/types.js';

function getEnvVar(env: Record<string, any>, keys: string[]): string | undefined {
    for (const key of keys) {
        const value = env[key];
        if (value) return value;
    }
    return undefined;
}

export const configSchema = z.object({
    AI_API_KEY: z.string().min(1, "API Key is required. Checked: BATCHPROMPT_OPENAI_API_KEY, OPENAI_API_KEY, AI_API_KEY"),
    AI_API_URL: z.string().url().default("https://api.openai.com/v1"),
    MODEL: z.string().optional(),
    GPT_MAX_CONVERSATION_CHARS: z.coerce.number().int().positive().optional(),
    CACHE_ENABLED: z.coerce.boolean().default(true),
    SQLITE_PATH: z.string().default(".cache.sqlite"),
    SERPER_API_KEY: z.string().optional(),
    TASK_CONCURRENCY: z.coerce.number().int().positive().default(100),
    GPT_CONCURRENCY: z.coerce.number().int().positive().default(50),
    SERPER_CONCURRENCY: z.coerce.number().int().positive().default(5),
    PUPPETEER_CONCURRENCY: z.coerce.number().int().positive().default(3),
    PUPPETEER_MAX_PAGES_BEFORE_RESTART: z.coerce.number().int().positive().default(50),
    PUPPETEER_RESTART_TIMEOUT: z.coerce.number().int().positive().default(10000),
});

export type ConfigOverrides = {
    concurrency?: number;
    imageSearch?: ImageSearch;
    webSearch?: WebSearch;
    openai?: OpenAI;
    retryBaseDelay?: number;
};

class KeyvCacheAdapter {
    constructor(private keyv: Keyv) {}
    async get<T>(key: string): Promise<T | undefined> { return this.keyv.get(key); }
    async set(key: string, value: any, ttl?: number): Promise<void> { await this.keyv.set(key, value, ttl); }
    async del(key: string): Promise<void> { await this.keyv.delete(key); }
    async reset(): Promise<void> { await this.keyv.clear(); }
    async mget(...keys: string[]): Promise<any[]> { return []; }
    async mset(args: [string, any][], ttl?: number): Promise<void> { return; }
    async mdel(...keys: string[]): Promise<void> { return; }
    async wrap<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> { return fn(); }
    store: any = {};
}

export const initConfig = async (env: Record<string, any>, overrides: ConfigOverrides = {}) => {
    const rawConfig = {
        ...env,
        AI_API_KEY: getEnvVar(env, ['BATCHPROMPT_OPENAI_API_KEY', 'OPENAI_API_KEY', 'AI_API_KEY']),
        AI_API_URL: getEnvVar(env, ['BATCHPROMPT_OPENAI_BASE_URL', 'OPENAI_BASE_URL', 'AI_API_URL']),
        MODEL: getEnvVar(env, ['BATCHPROMPT_OPENAI_MODEL', 'OPENAI_MODEL', 'MODEL']),
        SERPER_API_KEY: getEnvVar(env, ['BATCHPROMPT_SERPER_API_KEY', 'SERPER_API_KEY']),
        TASK_CONCURRENCY: getEnvVar(env, ['BATCHPROMPT_TASK_CONCURRENCY', 'TASK_CONCURRENCY']),
        GPT_CONCURRENCY: getEnvVar(env, ['BATCHPROMPT_GPT_CONCURRENCY', 'GPT_CONCURRENCY']),
        SERPER_CONCURRENCY: getEnvVar(env, ['BATCHPROMPT_SERPER_CONCURRENCY', 'SERPER_CONCURRENCY']),
        PUPPETEER_CONCURRENCY: getEnvVar(env, ['BATCHPROMPT_PUPPETEER_CONCURRENCY', 'PUPPETEER_CONCURRENCY']),
        PUPPETEER_MAX_PAGES_BEFORE_RESTART: getEnvVar(env, ['BATCHPROMPT_PUPPETEER_MAX_PAGES_BEFORE_RESTART', 'PUPPETEER_MAX_PAGES_BEFORE_RESTART']),
        PUPPETEER_RESTART_TIMEOUT: getEnvVar(env, ['BATCHPROMPT_PUPPETEER_RESTART_TIMEOUT', 'PUPPETEER_RESTART_TIMEOUT']),
    };

    const config = configSchema.parse(rawConfig);

    const capabilities: ServiceCapabilities = {
        hasSerper: !!config.SERPER_API_KEY || !!overrides.imageSearch || !!overrides.webSearch,
        hasPuppeteer: true
    };

    let cache: any;
    if (config.CACHE_ENABLED) {
        const keyv = new Keyv({
            store: new KeyvSqlite(`sqlite://${config.SQLITE_PATH}`),
            serialize: JSON.stringify,
            deserialize: JSON.parse
        });
        cache = new KeyvCacheAdapter(keyv);
    }

    const fetcher = createCachedFetcher({
        cache,
        fetch: createAiLoggingFetcher(),
        prefix: 'fetch',
        ttl: 24 * 60 * 60 * 1000,
        timeout: 3 * 60 * 1000,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const openai = overrides.openai || new OpenAI({
        baseURL: config.AI_API_URL,
        apiKey: config.AI_API_KEY,
        fetch: fetcher as any
    });

    const gptQueue = new PQueue({ concurrency: overrides.concurrency ?? config.GPT_CONCURRENCY });
    attachQueueLogger(gptQueue, 'GPT');

    const taskQueue = new PQueue({ concurrency: config.TASK_CONCURRENCY });
    attachQueueLogger(taskQueue, 'Task');

    const serperQueue = new PQueue({ concurrency: config.SERPER_CONCURRENCY });
    attachQueueLogger(serperQueue, 'Serper');

    const puppeteerQueue = new PQueue({ concurrency: config.PUPPETEER_CONCURRENCY });
    attachQueueLogger(puppeteerQueue, 'Puppeteer');

    const defaultModel = config.MODEL || 'google/gemini-3-flash-preview';

    let imageSearch: ImageSearch | undefined = overrides.imageSearch;
    let webSearch: WebSearch | undefined = overrides.webSearch;

    if (capabilities.hasSerper) {
        if (!imageSearch && config.SERPER_API_KEY) {
            imageSearch = new ImageSearch(config.SERPER_API_KEY, fetcher, serperQueue);
        }
        if (!webSearch && config.SERPER_API_KEY) {
            webSearch = new WebSearch(config.SERPER_API_KEY, fetcher, serperQueue);
        }
    }

    const puppeteerHelper = new PuppeteerHelper({
        cache,
        fetcher,
        maxPagesBeforeRestart: config.PUPPETEER_MAX_PAGES_BEFORE_RESTART,
        restartTimeout: config.PUPPETEER_RESTART_TIMEOUT
    });

    const llmFactory = new LlmClientFactory(openai, gptQueue, defaultModel, overrides.retryBaseDelay);

    // The "Upgraded" createLlm factory for plugins
    const createTheLlm: LlmFactory = (config: Partial<ModelConfig>) => {
        const modelConfig: Record<string, any> = {
            model: config.model || defaultModel
        };

        if (config.temperature !== undefined) {
            modelConfig.temperature = config.temperature;
        }

        if (config.thinkingLevel) {
            modelConfig.reasoning_effort = config.thinkingLevel;
        }

        return createLlm({
            openai: openai as any,
            defaultModel: modelConfig,
            queue: gptQueue,
            retryBaseDelay: overrides.retryBaseDelay,
        });
    };

    const promptLoader = {} as any; // Mock/Empty as it's removed

    const pluginRegistry = createPluginRegistry({
        webSearch,
        imageSearch,
        puppeteerHelper,
        createLlm: createTheLlm
    });

    const { EventEmitter } = await import('eventemitter3');
    const globalContext: GlobalContext = {
        openai,
        events: new EventEmitter(),
        cache,
        gptQueue,
        taskQueue,
        serperQueue,
        puppeteerQueue,
        puppeteerHelper,
        fetcher,
        imageSearch,
        webSearch,
        capabilities,
        defaultModel,
        pluginRegistry,
        llmFactory
    };

    return {
        config,
        globalContext,
        pluginRegistry,
        puppeteerHelper,
        capabilities,
        llmFactory,
    };
}

export type TheConfig = Awaited<ReturnType<typeof initConfig>>;

let configInstance: null | TheConfig = null;
export const getDiContainer = async (env: Record<string, any>, overrides?: ConfigOverrides) => {
    if(!configInstance) {
        configInstance = await initConfig(env, overrides);
    }
    return configInstance;
}
