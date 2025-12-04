import {z} from "zod";
import { Cache, createCache } from 'cache-manager';
import { createKeyv } from 'cacheable';
import { createKeyv as createKeyvRedis } from '@keyv/redis';
import OpenAI from "openai";
import PQueue from 'p-queue';
import {createCachedGptAsk} from "./lib/createCachedGptAsk.js";
import {AiWebsiteInfoScraper, BuildScraperFunction} from "./lib/AiWebsiteInfoScraper.js";
import {createCachedFetcher} from "./lib/createCachedFetcher.js";
import { IsCustomDomain } from "./lib/isCustomDomain.js";
import { PuppeteerHelper } from "./lib/PuppeteerHelper.js";
import type { LaunchOptions as PuppeteerLaunchOptions } from 'puppeteer';
import { EventTracker } from "./lib/EventTracker.js";
import { SingleFilePageGenerator } from "./lib/generateSingleFilePage/SingleFilePageGenerator.js";
import * as path from "path";
import { createVerifyEmail } from "./lib/verifyEmail.js";
import { AiLogoScraper } from "./lib/AiLogoScraper.js";
import { ZodLlmQuerier } from "./lib/zodLlmQuerier.js";

export const configSchema = z.object({
    CACHE_ENABLED: z.coerce.boolean().default(false),
    CACHE_DRIVER: z.enum(['redis', 'memory']).default('memory'),
    CACHE_REDIS_URL: z.string().url().optional(),
    OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
    OPENAI_MODEL: z.string().min(1, "OPENAI_MODEL is required"),
    OPENAI_WEAK_MODEL: z.string().optional(),
    OPENAI_API_URL: z.string().url(),
    APP_URL: z.string().url().optional(),
    REASONING_EFFORT_MODEL: z.enum(['medium', 'low', 'high']).optional(),
    REASONING_EFFORT_WEAK_MODEL: z.enum(['medium', 'low', 'high']).optional(),
    PORT: z.preprocess(
        // Coerce empty string to undefined to allow default to be applied
        (val) => (val === "" ? undefined : val),
        z.coerce.number().int().positive().default(3666)
    ),
    TMP_DIR: z.string().default('tmp'),
    PUPPETEER_HEADLESS: z.string()
        .optional()
        .default('true')
        .transform(val => val.toLowerCase() === 'true' || val === '1'),
    PUPPETEER_LAUNCH_ARGS: z.string().optional().transform((val) => {
        if (!val) return undefined; // handles undefined, null, ""
        const args = val.split(',').map(s => s.trim()).filter(s => s.length > 0);
        return args.length > 0 ? args : undefined;
    }),
    COMPANY_INFO_MAX_CONCURRENCY: z.coerce.number().int().positive().default(3),
    FETCHER_TIMEOUT: z.coerce.number().int().positive().default(30000),
    FETCHER_USER_AGENT: z.string().default('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'),
}).superRefine((data, ctx) => {
    if (data.CACHE_ENABLED && data.CACHE_DRIVER === 'redis' && !data.CACHE_REDIS_URL) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "CACHE_REDIS_URL is required when CACHE_DRIVER is 'redis' and CACHE_ENABLED is true",
            path: ['CACHE_REDIS_URL'],
        });
    }
}).transform((data) => {
    const appUrl = data.APP_URL || `http://localhost:${data.PORT}`;
    return {
        ...data,
        APP_URL: appUrl,
        OPENAI_WEAK_MODEL: data.OPENAI_WEAK_MODEL || data.OPENAI_MODEL,
    };
});

type CacheConfig = Pick<z.infer<typeof configSchema>, 'CACHE_ENABLED' | 'CACHE_DRIVER' | 'CACHE_REDIS_URL'>;

const createCacheInstance = (config: CacheConfig): Cache | undefined => {
    if (!config.CACHE_ENABLED) {
        return undefined;
    }

    console.log(`Cache enabled, using '${config.CACHE_DRIVER}' driver.`);
    if (config.CACHE_DRIVER === 'redis') {
        // The superRefine in configSchema ensures CACHE_REDIS_URL is present.
        const redisStore = createKeyvRedis(config.CACHE_REDIS_URL!);
        return createCache({ stores: [redisStore] });
    }

    // 'memory' driver
    return createCache({ stores: [createKeyv()] });
};

export type BuildSingleFilePageGenerator = () => {
    generator: SingleFilePageGenerator;
    outputDir: string;
};

export const initConfig = async () => {
    const config = configSchema.parse(process.env);

    const cache = createCacheInstance(config);

    const companyInfoQueue = new PQueue({ concurrency: config.COMPANY_INFO_MAX_CONCURRENCY });

    const puppeteerLaunchOptions: PuppeteerLaunchOptions = {
        // @ts-ignore
        headless: config.PUPPETEER_HEADLESS ? 'new' : false,
    };
    if (config.PUPPETEER_LAUNCH_ARGS) {
        puppeteerLaunchOptions.args = config.PUPPETEER_LAUNCH_ARGS;
    }

    const fetcher = cache ? createCachedFetcher({
        cache,
        prefix: 'fetcher',
        ttl: 3600 * 1000, // 1 hour
        timeout: config.FETCHER_TIMEOUT,
        userAgent: config.FETCHER_USER_AGENT,
    }) : fetch;

    // This is the main puppeteer instance for services that don't manage their own.
    const puppeteerHelper = new PuppeteerHelper({
        puppeteerLaunchOptions,
        cache,
        browserUserDataDir: path.join(config.TMP_DIR, 'puppeteer_user_data'),
        fetcher,
    });
    await puppeteerHelper.init();
    //
    // const pageHelper = await puppeteerHelper.getPageHelper();
    // await pageHelper.navigateToUrl('https://butlerapp.de')
    //
    // const screenshot  = await pageHelper.takeScreenshots([{width: 1920, height: 1080}]);

    const openAi = new OpenAI({
        baseURL: config.OPENAI_API_URL,
        apiKey: config.OPENAI_API_KEY,
    });

    const ask = createCachedGptAsk({
        baseURL: config.OPENAI_API_URL,
        apiKey: config.OPENAI_API_KEY,
        defaultModel: config.OPENAI_MODEL,
        cache,
    });

    const askWeak = createCachedGptAsk({
        baseURL: config.OPENAI_API_URL,
        apiKey: config.OPENAI_API_KEY,
        defaultModel: config.OPENAI_WEAK_MODEL,
        cache,
    });

    const buildAiWebsiteInfoScraper: BuildScraperFunction = (eventTracker: EventTracker, options: { useAiMerge?: boolean, mergeInstruction?: string } = {}) => {
        const reasoningOptions = config.REASONING_EFFORT_MODEL ? { reasoning: { effort: config.REASONING_EFFORT_MODEL } } : {};
        const weakReasoningOptions = config.REASONING_EFFORT_WEAK_MODEL ? { reasoning: { effort: config.REASONING_EFFORT_WEAK_MODEL } } : {};
        const linkInstruction = `Your task is to find up to 3 URLs on the given website that are most likely to contain company information or product details. Prioritize pages in this order: 'Imprint', 'Contact',  specific product/service pages.`;

        const infoQuerier = new ZodLlmQuerier(ask);
        const weakQuerier = new ZodLlmQuerier(askWeak);

        return new AiWebsiteInfoScraper({
            infoQuerier,
            linkQuerier: weakQuerier,
            mergeQuerier: weakQuerier,
            eventTracker,
            puppeteerHelper,
        }, {
            numberOfPages: 3,
            extractOptions: { maxRetries: 3, ...reasoningOptions, useResponseFormat: false },
            linkExtractOptions: { maxRetries: 3, ...weakReasoningOptions, useResponseFormat: false },
            mergeOptions: { maxRetries: 3, ...weakReasoningOptions, useResponseFormat: false },
            linkInstruction,
            useAiMerge: options.useAiMerge,
            mergeInstruction: options.mergeInstruction,
        });
    };

    const buildAiLogoScraper = (eventTracker: EventTracker) => {
        const reasoningOptions = config.REASONING_EFFORT_MODEL ? { reasoning: { effort: config.REASONING_EFFORT_MODEL } } : {};
        const weakReasoningOptions = config.REASONING_EFFORT_WEAK_MODEL ? { reasoning: { effort: config.REASONING_EFFORT_WEAK_MODEL } } : {};

        return new AiLogoScraper({
            ask,
            askWeak,
            eventTracker,
            puppeteerHelper,
        }, {
            logoOptions: { maxRetries: 3, ...reasoningOptions, useResponseFormat: false },
            linkExtractOptions: { maxRetries: 3, ...weakReasoningOptions, useResponseFormat: false },
            brandLogoScoreThreshold: 5,
        });
    };

    const isCustomDomain = new IsCustomDomain({ ask: askWeak });


    const verifyEmail = createVerifyEmail({ cache });

    return {
        fetcher,
        cache,
        config,
        openAi,
        ask,
        askWeak,
        buildAiWebsiteInfoScraper,
        buildAiLogoScraper,
        isCustomDomain,
        puppeteerHelper,
        verifyEmail,
        companyInfoQueue,
    }
}

export type TheConfig = Awaited<ReturnType<typeof initConfig>>;

let config: null | TheConfig = null;
export const getConfig = async () => {
    if(!config) {
        config = await initConfig();
    }

    return config;
}
