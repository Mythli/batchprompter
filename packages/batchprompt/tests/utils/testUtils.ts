import { vi } from 'vitest';
import OpenAI from 'openai';
import PQueue from 'p-queue';
import { EventEmitter } from 'eventemitter3';
import { GlobalContext } from '../../src/types.js';
import { MemoryContentResolver } from '../../src/core/io/MemoryContentResolver.js';
import { LlmClientFactory } from '../../src/core/LlmClientFactory.js';
import { MessageBuilder } from '../../src/core/MessageBuilder.js';
import { Plugin, createPluginRegistry } from '../../src/plugins/index.js';
import { ActionRunner } from '../../src/ActionRunner.js';
import { InMemoryConfigExecutor } from '../../src/generator/InMemoryConfigExecutor.js';
import { PromptLoader } from '../../src/config/PromptLoader.js';
import {createMockOpenAI, getPromptSummary, LlmFatalError} from 'llm-fns';
import { DebugLogger } from "../../src/index.js";

export type MockResponseResolver = (messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) => string | any;

export interface TestContextOptions {
    responses?: (string | any)[] | MockResponseResolver;
    webSearch?: any;
    imageSearch?: any;
}

export function createTestContext(options: TestContextOptions = {}) {
    const { responses = [], webSearch, imageSearch } = options;
    const openai = createMockOpenAI(responses);
    const events = new EventEmitter();
    const contentResolver = new MemoryContentResolver();

    const globalContext: GlobalContext = {
        openai,
        events: events as any,
        gptQueue: new PQueue(),
        taskQueue: new PQueue(),
        serperQueue: new PQueue(),
        puppeteerQueue: new PQueue(),
        puppeteerHelper: {
            getPageHelper: vi.fn(),
            close: vi.fn()
        } as any,
        // Default mock fetcher that returns 404 to prevent crashes if not overridden
        fetcher: vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
            statusText: "Not Found",
            text: async () => "",
            json: async () => ({}),
            headers: new Map()
        }) as any,
        capabilities: {
            hasSerper: !!webSearch || !!imageSearch,
            hasPuppeteer: true
        },
        defaultModel: 'gpt-mock',
        contentResolver,
        webSearch,
        imageSearch
    } as any; // Cast to any because we construct the rest below

    return { globalContext, openai, events, contentResolver };
}

export interface TestEnvOptions {
    mockResponses?: (string | any)[] | MockResponseResolver;
    plugins?: Plugin[];
    schemaLoader?: any;
    webSearch?: any;
    imageSearch?: any;
}

export function setupTestEnvironment(options: TestEnvOptions = {}) {
    const {
        mockResponses = [],
        plugins = [],
        schemaLoader = { load: async () => ({}) },
        webSearch,
        imageSearch
    } = options;

    const { globalContext, openai, events, contentResolver } = createTestContext({
        responses: mockResponses,
        webSearch,
        imageSearch
    });

    // Add DebugLogger to see events in test output
    new DebugLogger(events as any);

    const llmFactory = new LlmClientFactory(openai, globalContext.gptQueue, 'gpt-mock', 0);
    const messageBuilder = new MessageBuilder();

    const promptLoader = new PromptLoader(contentResolver);

    // Create registry with injected dependencies
    const createLlm = (config: any) => llmFactory.create(config).getRawClient();

    const pluginRegistry = createPluginRegistry({
        promptLoader,
        createLlm: createLlm as any,
        webSearch: globalContext.webSearch,
        imageSearch: globalContext.imageSearch,
        puppeteerHelper: globalContext.puppeteerHelper,
        puppeteerQueue: globalContext.puppeteerQueue,
        fetcher: globalContext.fetcher
    });

    // Apply overrides
    for (const plugin of plugins) {
        pluginRegistry.override(plugin);
    }

    // Complete GlobalContext construction
    globalContext.pluginRegistry = pluginRegistry;
    globalContext.llmFactory = llmFactory;

    const actionRunner = new ActionRunner(
        globalContext
    );

    const executor = new InMemoryConfigExecutor(
        actionRunner,
        pluginRegistry,
        events,
        contentResolver
    );

    return {
        executor,
        openai,
        events,
        registry: pluginRegistry,
        globalContext,
        contentResolver
    };
}
