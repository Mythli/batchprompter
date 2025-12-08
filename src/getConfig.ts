// 
import * as dotenv from 'dotenv';
import { z } from 'zod';
// import { createCache } from 'cache-manager';
import KeyvSqlite from '@keyv/sqlite';
import Keyv from 'keyv';
import OpenAI from "openai";
import { createLlm } from 'llm-fns';
import PQueue from 'p-queue';
import { ImageSearch } from './plugins/image-search/ImageSearch.js';
import { AiImageSearch } from './utils/AiImageSearch.js';
import { WebSearch } from './plugins/web-search/WebSearch.js';
import { AiWebSearch } from './utils/AiWebSearch.js';
import { createCachedFetcher } from './utils/createCachedFetcher.js';
import { ModelFlags } from './cli/ModelFlags.js';
import { PluginRegistry } from './plugins/PluginRegistry.js';
import { ImageSearchPlugin } from './plugins/image-search/ImageSearchPlugin.js';
import { WebSearchPlugin } from './plugins/web-search/WebSearchPlugin.js';
import { StyleScraperPlugin } from './plugins/style-scraper/StyleScraperPlugin.js';
import { WebsiteAgentPlugin } from './plugins/website-agent/WebsiteAgentPlugin.js';
import { DedupePlugin } from './plugins/dedupe/DedupePlugin.js';
import { ValidationPlugin } from './plugins/validation/ValidationPlugin.js';
import { ActionRunner } from './ActionRunner.js';
import { PuppeteerHelper } from './utils/puppeteer/PuppeteerHelper.js';
import { AiWebsiteAgent } from './utils/AiWebsiteAgent.js';
import { PromptPreprocessorRegistry } from './preprocessors/PromptPreprocessorRegistry.js';
import { UrlExpanderPlugin } from './preprocessors/UrlExpanderPlugin.js';
import { UrlHandlerRegistry } from './preprocessors/expander/UrlHandlerRegistry.js';
import { GenericFetchHandler } from './preprocessors/expander/GenericFetchHandler.js';
import { GenericPuppeteerHandler } from './preprocessors/expander/GenericPuppeteerHandler.js';
import { WikipediaHandler } from './preprocessors/expander/sites/WikipediaHandler.js';
import { createLoggingFetcher } from './utils/createLoggingFetcher.js';

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
    MODEL: z.string().optional(),
    GPT_MAX_CONVERSATION_CHARS: z.coerce.number().int().positive().optional(),
    CACHE_ENABLED: z.coerce.boolean().default(true),
    SQLITE_PATH: z.string().default(".cache.sqlite"),
    SERPER_API_KEY: z.string().optional(),
    TASK_CONCURRENCY: z.coerce.number().int().positive().default(100),
    SERPER_CONCURRENCY: z.coerce.number().int().positive().default(5),
    PUPPETEER_CONCURRENCY: z.coerce.number().int().positive().default(3),
});

export type ConfigOverrides = {
    concurrency?: number;
};

export const createDefaultRegistry = () => {
    const registry = new PluginRegistry();
    // Register search plugins first so their data is available to subsequent plugins
    registry.register(new WebSearchPlugin());
    registry.register(new ImageSearchPlugin());
    registry.register(new WebsiteAgentPlugin());
    registry.register(new StyleScraperPlugin());
    
    // New Plugins
    registry.register(new DedupePlugin());
    registry.register(new ValidationPlugin());
    
    return registry;
};

export const createPreprocessorRegistry = () => {
    const registry = new PromptPreprocessorRegistry();
    
    // --- URL Expander Setup ---
    // 1. Instantiate Generics
    const fetchHandler = new GenericFetchHandler();
    const puppeteerHandler = new GenericPuppeteerHandler();

    // 2. Instantiate Registry
    const urlHandlerRegistry = new UrlHandlerRegistry(fetchHandler, puppeteerHandler);

    // 3. Register Specific Handlers (Injecting Generics)
    urlHandlerRegistry.registerSpecific(new WikipediaHandler());

    // 4. Register Plugin
    registry.register(new UrlExpanderPlugin(urlHandlerRegistry));
    
    return registry;
};

// Adapter to make Keyv compatible with cache-manager Cache interface
class KeyvCacheAdapter {
    constructor(private keyv: Keyv) {}

    async get<T>(key: string): Promise<T | undefined> {
        return this.keyv.get(key);
    }

    async set(key: string, value: any, ttl?: number): Promise<void> {
        await this.keyv.set(key, value, ttl);
    }

    async del(key: string): Promise<void> {
        await this.keyv.delete(key);
    }

    async reset(): Promise<void> {
        await this.keyv.clear();
    }

    // Stubs for full Cache interface compliance
    async mget(...keys: string[]): Promise<any[]> { return []; }
    async mset(args: [string, any][], ttl?: number): Promise<void> { return; }
    async mdel(...keys: string[]): Promise<void> { return; }
    async wrap<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> { return fn(); }
    store: any = {};
}

export const initConfig = async (overrides: ConfigOverrides = {}) => {
    // Resolve values from multiple possible environment variable names
    const rawConfig = {
        ...process.env,
        AI_API_KEY: getEnvVar(['BATCHPROMPT_OPENAI_API_KEY', 'OPENAI_API_KEY', 'AI_API_KEY']),
        AI_API_URL: getEnvVar(['BATCHPROMPT_OPENAI_BASE_URL', 'OPENAI_BASE_URL', 'AI_API_URL']),
        MODEL: getEnvVar(['BATCHPROMPT_OPENAI_MODEL', 'OPENAI_MODEL', 'MODEL']),
        SERPER_API_KEY: getEnvVar(['BATCHPROMPT_SERPER_API_KEY', 'SERPER_API_KEY']),
        TASK_CONCURRENCY: getEnvVar(['BATCHPROMPT_TASK_CONCURRENCY', 'TASK_CONCURRENCY']),
        SERPER_CONCURRENCY: getEnvVar(['BATCHPROMPT_SERPER_CONCURRENCY', 'SERPER_CONCURRENCY']),
        PUPPETEER_CONCURRENCY: getEnvVar(['BATCHPROMPT_PUPPETEER_CONCURRENCY', 'PUPPETEER_CONCURRENCY']),
    };

    const config = configSchema.parse(rawConfig);

    // Setup Cache
    let cache: any; // Use any to bypass strict Cache type check if needed, or use the adapter
    if (config.CACHE_ENABLED) {
        const keyv = new Keyv({
            store: new KeyvSqlite(`sqlite://${config.SQLITE_PATH}`),
            serialize: JSON.stringify,
            deserialize: JSON.parse
        });
        cache = new KeyvCacheAdapter(keyv);
    }

    // Setup Fetcher (Global)
    const fetcher = createCachedFetcher({
        cache,
        prefix: 'fetch',
        ttl: 24 * 60 * 60 * 1000, // 24 hours
        timeout: 30000, // 30 seconds
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const openAi = new OpenAI({
        baseURL: config.AI_API_URL,
        apiKey: config.AI_API_KEY,
        fetch: createLoggingFetcher(),
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
        openai: openAi as any, // Cast to any to avoid version mismatch issues
        defaultModel: config.MODEL,
        cache: cache,
        queue: gptQueue,
        maxConversationChars: config.GPT_MAX_CONVERSATION_CHARS,
    });

    // Serper Queue
    const serperQueue = new PQueue({ concurrency: config.SERPER_CONCURRENCY });

    let imageSearch: ImageSearch | undefined;
    let aiImageSearch: AiImageSearch | undefined;
    let webSearch: WebSearch | undefined;
    let aiWebSearch: AiWebSearch | undefined;

    if (config.SERPER_API_KEY) {
        // Pass cache to ImageSearch for Serper results, and fetcher for downloads
        imageSearch = new ImageSearch(config.SERPER_API_KEY, fetcher, serperQueue);
        aiImageSearch = new AiImageSearch(imageSearch, llm);
        
        webSearch = new WebSearch(config.SERPER_API_KEY, fetcher, serperQueue);
        aiWebSearch = new AiWebSearch(webSearch, llm);
    }

    // Initialize PuppeteerHelper
    const puppeteerHelper = new PuppeteerHelper({
        cache,
        fetcher
    });
    // We don't await init() here, let it lazy load on first use to avoid overhead if not used.

    // Initialize Puppeteer Queue
    const puppeteerQueue = new PQueue({ concurrency: config.PUPPETEER_CONCURRENCY });

    // Initialize AiWebsiteAgent
    const aiWebsiteAgent = new AiWebsiteAgent(puppeteerHelper, llm, puppeteerQueue);

    // Initialize ModelFlags with the resolved default model
    const modelFlags = new ModelFlags(config.MODEL);

    // Initialize PluginRegistry
    const pluginRegistry = createDefaultRegistry();

    // Initialize PreprocessorRegistry
    const preprocessorRegistry = createPreprocessorRegistry();

    // Initialize ActionRunner
    const actionRunner = new ActionRunner(
        llm,
        { imageSearch, aiImageSearch, webSearch, aiWebSearch, fetcher, puppeteerHelper, aiWebsiteAgent, puppeteerQueue },
        pluginRegistry,
        preprocessorRegistry
    );

    return {
        config,
        llm,
        imageSearch,
        aiImageSearch,
        webSearch,
        aiWebSearch,
        modelFlags,
        fetcher,
        pluginRegistry,
        preprocessorRegistry,
        actionRunner,
        puppeteerHelper,
        aiWebsiteAgent
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
