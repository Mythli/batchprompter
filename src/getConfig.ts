import * as dotenv from 'dotenv';
import { z } from 'zod';
import KeyvSqlite from '@keyv/sqlite';
import Keyv from 'keyv';
import OpenAI from "openai";
import PQueue from 'p-queue';
import { ImageSearch } from './plugins/image-search/ImageSearch.js';
import { WebSearch } from './plugins/web-search/WebSearch.js';
import { createPluginRegistry, PluginRegistryV2 } from './plugins/index.js';
import { ActionRunner } from './ActionRunner.js';
import { PuppeteerHelper } from './utils/puppeteer/PuppeteerHelper.js';
import { PromptPreprocessorRegistry } from './preprocessors/PromptPreprocessorRegistry.js';
import { UrlExpanderPlugin } from './preprocessors/UrlExpanderPlugin.js';
import { UrlHandlerRegistry } from './preprocessors/expander/UrlHandlerRegistry.js';
import { GenericFetchHandler } from './preprocessors/expander/GenericFetchHandler.js';
import { GenericPuppeteerHandler } from './preprocessors/expander/GenericPuppeteerHandler.js';
import { WikipediaHandler } from './preprocessors/expander/sites/WikipediaHandler.js';
import { createCachedFetcher } from "llm-fns";
import { attachQueueLogger } from './utils/queueUtils.js';
import { GlobalContext, ServiceCapabilities } from './types.js';
import { LlmClientFactory } from './core/LlmClientFactory.js';
import { StepResolver } from './core/StepResolver.js';
import { MessageBuilder } from './core/MessageBuilder.js';
import { createLoggingFetcher } from "./utils/createLoggingFetcher.js";

dotenv.config();

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
    GPT_CONCURRENCY: z.coerce.number().int().positive().default(50),
    SERPER_CONCURRENCY: z.coerce.number().int().positive().default(5),
    PUPPETEER_CONCURRENCY: z.coerce.number().int().positive().default(3),
    PUPPETEER_MAX_PAGES_BEFORE_RESTART: z.coerce.number().int().positive().default(50),
    PUPPETEER_RESTART_TIMEOUT: z.coerce.number().int().positive().default(10000),
});

export type ConfigOverrides = {
    concurrency?: number;
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

    async mget(...keys: string[]): Promise<any[]> { return []; }
    async mset(args: [string, any][], ttl?: number): Promise<void> { return; }
    async mdel(...keys: string[]): Promise<void> { return; }
    async wrap<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> { return fn(); }
    store: any = {};
}

export const createDefaultRegistry = (capabilities: ServiceCapabilities): PluginRegistryV2 => {
    return createPluginRegistry();
};

export const createPreprocessorRegistry = () => {
    const registry = new PromptPreprocessorRegistry();

    const fetchHandler = new GenericFetchHandler();
    const puppeteerHandler = new GenericPuppeteerHandler();
    const urlHandlerRegistry = new UrlHandlerRegistry(fetchHandler, puppeteerHandler);
    urlHandlerRegistry.registerSpecific(new WikipediaHandler());
    registry.register(new UrlExpanderPlugin(urlHandlerRegistry));

    return registry;
};

export const initConfig = async (overrides: ConfigOverrides = {}) => {
    const rawConfig = {
        ...process.env,
        AI_API_KEY: getEnvVar(['BATCHPROMPT_OPENAI_API_KEY', 'OPENAI_API_KEY', 'AI_API_KEY']),
        AI_API_URL: getEnvVar(['BATCHPROMPT_OPENAI_BASE_URL', 'OPENAI_BASE_URL', 'AI_API_URL']),
        MODEL: getEnvVar(['BATCHPROMPT_OPENAI_MODEL', 'OPENAI_MODEL', 'MODEL']),
        SERPER_API_KEY: getEnvVar(['BATCHPROMPT_SERPER_API_KEY', 'SERPER_API_KEY']),
        TASK_CONCURRENCY: getEnvVar(['BATCHPROMPT_TASK_CONCURRENCY', 'TASK_CONCURRENCY']),
        GPT_CONCURRENCY: getEnvVar(['BATCHPROMPT_GPT_CONCURRENCY', 'GPT_CONCURRENCY']),
        SERPER_CONCURRENCY: getEnvVar(['BATCHPROMPT_SERPER_CONCURRENCY', 'SERPER_CONCURRENCY']),
        PUPPETEER_CONCURRENCY: getEnvVar(['BATCHPROMPT_PUPPETEER_CONCURRENCY', 'PUPPETEER_CONCURRENCY']),
        PUPPETEER_MAX_PAGES_BEFORE_RESTART: getEnvVar(['BATCHPROMPT_PUPPETEER_MAX_PAGES_BEFORE_RESTART', 'PUPPETEER_MAX_PAGES_BEFORE_RESTART']),
        PUPPETEER_RESTART_TIMEOUT: getEnvVar(['BATCHPROMPT_PUPPETEER_RESTART_TIMEOUT', 'PUPPETEER_RESTART_TIMEOUT']),
    };

    const config = configSchema.parse(rawConfig);

    // Compute Service Capabilities
    const capabilities: ServiceCapabilities = {
        hasSerper: !!config.SERPER_API_KEY,
        hasPuppeteer: true // Puppeteer is always available (bundled)
    };

    // Setup Cache
    let cache: any;
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
        fetch: createLoggingFetcher(),
        prefix: 'fetch',
        ttl: 24 * 60 * 60 * 1000,
        timeout: 3 * 60 * 1000,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    // Setup OpenAI Client
    const openai = new OpenAI({
        baseURL: config.AI_API_URL,
        apiKey: config.AI_API_KEY,
        fetch: fetcher as any
    });

    // Setup Queues
    const gptQueue = new PQueue({ concurrency: overrides.concurrency ?? config.GPT_CONCURRENCY });
    attachQueueLogger(gptQueue, 'GPT');

    const serperQueue = new PQueue({ concurrency: config.SERPER_CONCURRENCY });
    attachQueueLogger(serperQueue, 'Serper');

    const puppeteerQueue = new PQueue({ concurrency: config.PUPPETEER_CONCURRENCY });
    attachQueueLogger(puppeteerQueue, 'Puppeteer');

    // Default Model
    const defaultModel = config.MODEL || 'gpt-4o-mini';

    // Setup Optional Services (based on capabilities)
    let imageSearch: ImageSearch | undefined;
    let webSearch: WebSearch | undefined;

    if (capabilities.hasSerper) {
        imageSearch = new ImageSearch(config.SERPER_API_KEY!, fetcher, serperQueue);
        webSearch = new WebSearch(config.SERPER_API_KEY!, fetcher, serperQueue);
    }

    // Initialize PuppeteerHelper
    const puppeteerHelper = new PuppeteerHelper({
        cache,
        fetcher,
        maxPagesBeforeRestart: config.PUPPETEER_MAX_PAGES_BEFORE_RESTART,
        restartTimeout: config.PUPPETEER_RESTART_TIMEOUT
    });

    // Build GlobalContext
    const globalContext: GlobalContext = {
        openai,
        cache,
        gptQueue,
        serperQueue,
        puppeteerQueue,
        puppeteerHelper,
        fetcher,
        imageSearch,
        webSearch,
        capabilities,
        defaultModel
    };

    // Create Factories
    const llmFactory = new LlmClientFactory(openai, cache, gptQueue, defaultModel);
    const stepResolver = new StepResolver(llmFactory, globalContext);
    const messageBuilder = new MessageBuilder();

    // Initialize Registries (with capabilities for validation)
    const pluginRegistry = createDefaultRegistry(capabilities);
    const preprocessorRegistry = createPreprocessorRegistry();

    // Initialize ActionRunner
    const actionRunner = new ActionRunner(
        globalContext,
        pluginRegistry,
        preprocessorRegistry,
        stepResolver,
        messageBuilder
    );

    return {
        config,
        globalContext,
        pluginRegistry,
        preprocessorRegistry,
        actionRunner,
        puppeteerHelper,
        capabilities,
        llmFactory,
        stepResolver,
        messageBuilder
    };
}

export type TheConfig = Awaited<ReturnType<typeof initConfig>>;

let configInstance: null | TheConfig = null;
export const getConfig = async (overrides?: ConfigOverrides) => {
    if(!configInstance) {
        configInstance = await initConfig(overrides);
    }
    return configInstance;
}
