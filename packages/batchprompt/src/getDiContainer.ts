import { z } from 'zod';
import KeyvSqlite from '@keyv/sqlite';
import Keyv from 'keyv';
import OpenAI from "openai";
import PQueue from 'p-queue';
import { ImageSearch } from './plugins/image-search/ImageSearch.js';
import { WebSearch } from './plugins/web-search/WebSearch.js';
import { createPluginRegistry } from './plugins/index.js';
import { PuppeteerHelper } from './utils/puppeteer/PuppeteerHelper.js';
import {createAiLoggingFetcher, createCachedFetcher, createLlm, CacheLike } from "llm-fns";
import { LlmClientFactory } from './LlmClientFactory.js';
import { attachQueueLogger } from "./debug/queue.js";
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from './events.js';
import {ModelConfig} from "./config/model.js";
import { PluginRegistryV2 } from './plugins/types.js';
import { ImageSearchPlugin } from './plugins/image-search/ImageSearchPlugin.js';
import { LogoScraperPlugin } from './plugins/logo-scraper/LogoScraperPlugin.js';
import { ImageDownloader } from './plugins/logo-scraper/utils/ImageDownloader.js';
import { LoadDataPlugin } from './plugins/load-data/LoadDataPlugin.js';
import { GmailSenderPlugin } from './plugins/gmail-sender/GmailSenderPlugin.js';
import { GmailReplierPlugin } from './plugins/gmail-replier/GmailReplierPlugin.js';
import { createGmailClient, GmailClient } from 'gmail-puppet';

export interface ServiceCapabilities {
    hasSerper: boolean;
    hasPuppeteer: boolean;
}


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
    PUPPETEER_HEADLESS: z.string().optional().default('true').transform(val => val !== 'false'),
    PUPPETEER_SLOW_MO: z.coerce.number().int().min(0).default(0),
    GMAIL_EMAIL: z.string().optional(),
    GMAIL_PASSWORD: z.string().optional(),
});

export type ConfigOverrides = {
    concurrency?: number;
    imageSearch?: ImageSearch;
    webSearch?: WebSearch;
    openai?: OpenAI;
    retryBaseDelay?: number;
};

class KeyvCacheAdapter implements CacheLike {
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

export interface BatchPromptDeps {
    openai: OpenAI;
    events: EventEmitter<BatchPromptEvents>;
    cache: CacheLike | undefined;
    gptQueue: PQueue;
    taskQueue: PQueue;
    serperQueue: PQueue;
    puppeteerQueue: PQueue;
    puppeteerHelper: PuppeteerHelper;
    fetcher: ReturnType<typeof createCachedFetcher>;
    imageSearch: ImageSearch | undefined;
    webSearch: WebSearch | undefined;
    capabilities: ServiceCapabilities;
    defaultModel: string;
    pluginRegistry: PluginRegistryV2;
    llmFactory: LlmClientFactory;
    gmailClient: GmailClient | undefined;
}

export const initConfig = async (env: Record<string, any>, overrides: ConfigOverrides = {}): Promise<BatchPromptDeps> => {
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
        PUPPETEER_HEADLESS: getEnvVar(env, ['BATCHPROMPT_PUPPETEER_HEADLESS', 'PUPPETEER_HEADLESS']),
        PUPPETEER_SLOW_MO: getEnvVar(env, ['BATCHPROMPT_PUPPETEER_SLOW_MO', 'PUPPETEER_SLOW_MO']),
        GMAIL_EMAIL: getEnvVar(env, ['GMAIL_EMAIL']),
        GMAIL_PASSWORD: getEnvVar(env, ['GMAIL_PASSWORD']),
    };

    const config = configSchema.parse(rawConfig);

    const capabilities: ServiceCapabilities = {
        hasSerper: !!config.SERPER_API_KEY || !!overrides.imageSearch || !!overrides.webSearch,
        hasPuppeteer: true
    };

    let cache: CacheLike | undefined;
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

    const gptQueue: PQueue = new PQueue({ concurrency: overrides.concurrency ?? config.GPT_CONCURRENCY });
    attachQueueLogger(gptQueue, 'GPT');

    const taskQueue: PQueue = new PQueue({ concurrency: config.TASK_CONCURRENCY });
    attachQueueLogger(taskQueue, 'Task');

    const serperQueue: PQueue = new PQueue({ concurrency: config.SERPER_CONCURRENCY });
    attachQueueLogger(serperQueue, 'Serper');

    const puppeteerQueue: PQueue = new PQueue({ concurrency: config.PUPPETEER_CONCURRENCY });
    attachQueueLogger(puppeteerQueue, 'Puppeteer');

    const defaultModel = config.MODEL || 'google/gemini-3-flash-preview';

    let imageSearch: ImageSearch | undefined = overrides.imageSearch;
    let webSearch: WebSearch | undefined = overrides.webSearch;

    if (capabilities.hasSerper) {
        if (!imageSearch && config.SERPER_API_KEY) {
            imageSearch = new ImageSearch(config.SERPER_API_KEY, fetcher as any, serperQueue);
        }
        if (!webSearch && config.SERPER_API_KEY) {
            webSearch = new WebSearch(config.SERPER_API_KEY, fetcher as any, serperQueue);
        }
    }

    const puppeteerHelper = new PuppeteerHelper({
        cache: cache as any,
        fetcher: fetcher as any,
        maxPagesBeforeRestart: config.PUPPETEER_MAX_PAGES_BEFORE_RESTART,
        restartTimeout: config.PUPPETEER_RESTART_TIMEOUT,
        puppeteerLaunchOptions: {
            headless: config.PUPPETEER_HEADLESS,
            slowMo: config.PUPPETEER_SLOW_MO
        }
    });

    let gmailClient: GmailClient | undefined;
    if (config.GMAIL_EMAIL && config.GMAIL_PASSWORD) {
        const baseGmailClient = createGmailClient({
            getPage: () => puppeteerHelper.getPage(),
            email: config.GMAIL_EMAIL,
            password: config.GMAIL_PASSWORD
        });

        // Wrap the client methods in the puppeteerQueue to enforce concurrency limits
        gmailClient = {
            searchEmails: (query?: string, limit?: number) => puppeteerQueue.add(() => baseGmailClient.searchEmails(query, limit)) as Promise<any>,
            readThread: (threadId: string) => puppeteerQueue.add(() => baseGmailClient.readThread(threadId)) as Promise<any>,
            sendEmail: (options: any) => puppeteerQueue.add(() => baseGmailClient.sendEmail(options)) as Promise<any>,
            close: () => baseGmailClient.close()
        } as GmailClient;
    }

    const llmFactory = new LlmClientFactory(openai, gptQueue, defaultModel, overrides.retryBaseDelay);

    // The "Upgraded" createLlm factory for plugins
    const createTheLlm = (config: Partial<ModelConfig>) => {
        return createLlm({
            openai,
            defaultModel: config,
            queue: gptQueue,
            retryBaseDelay: overrides.retryBaseDelay,
        });
    };

    const pluginRegistry = createPluginRegistry({
        webSearch,
        imageSearch,
        puppeteerHelper,
        createLlm: createTheLlm,
        fetcher: fetcher as any,
        puppeteerQueue
    });

    if (imageSearch) {
        pluginRegistry.registerFactory('imageSearch', () => new ImageSearchPlugin({ imageSearch: imageSearch! }));
    }

    const imageDownloader = new ImageDownloader(fetcher as any);
    pluginRegistry.registerFactory('logoScraper', () => new LogoScraperPlugin({ puppeteerHelper, imageDownloader }));
    
    pluginRegistry.registerFactory('loadData', () => new LoadDataPlugin());

    pluginRegistry.registerFactory('gmailSender', () => new GmailSenderPlugin({
        gmailClient
    }));

    pluginRegistry.registerFactory('gmailReplier', () => new GmailReplierPlugin({
        gmailClient
    }));

    const events = new EventEmitter<BatchPromptEvents>();

    return {
        openai,
        events,
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
        llmFactory,
        gmailClient
    };
}

let configInstance: null | BatchPromptDeps = null;
export const getDiContainer = async (env: Record<string, any>, overrides?: ConfigOverrides): Promise<BatchPromptDeps> => {
    if(!configInstance) {
        configInstance = await initConfig(env, overrides);
    }
    return configInstance;
}
