import { vi } from 'vitest';
import OpenAI from 'openai';
import PQueue from 'p-queue';
import { EventEmitter } from 'eventemitter3';
import { LlmClientFactory } from '../../src/LlmClientFactory.js';
import { BasePlugin, createPluginRegistry } from '../../src/plugins/index.js';
import { createMockOpenAI } from 'llm-fns';
import { DebugLogger } from "../../src/index.js";
import { Pipeline } from '../../src/Pipeline.js';
import { Step } from '../../src/Step.js';
import { createPipelineSchema } from '../../src/config/index.js';
import { BatchPromptDeps } from '../../src/getDiContainer.js';
import { BatchPromptEvents } from '../../src/events.js';

export type MockResponseResolver = (messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) => string | any;

export interface TestContextOptions {
    responses?: (string | any)[] | MockResponseResolver;
    webSearch?: any;
    imageSearch?: any;
}

export function createTestContext(options: TestContextOptions = {}) {
    const { responses = [], webSearch, imageSearch } = options;
    const openai = createMockOpenAI(responses);
    const events = new EventEmitter<BatchPromptEvents>();

    const deps: BatchPromptDeps = {
        openai,
        events: events as any,
        cache: undefined,
        gptQueue: new PQueue(),
        taskQueue: new PQueue(),
        serperQueue: new PQueue(),
        puppeteerQueue: new PQueue(),
        puppeteerHelper: {
            getPageHelper: vi.fn(),
            close: vi.fn()
        } as any,
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
        webSearch,
        imageSearch,
        pluginRegistry: null as any,
        llmFactory: null as any
    };

    return { deps, openai, events };
}

export interface TestEnvOptions {
    mockResponses?: (string | any)[] | MockResponseResolver;
    plugins?: BasePlugin[];
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

    const { deps, openai, events } = createTestContext({
        responses: mockResponses,
        webSearch,
        imageSearch
    });

    new DebugLogger(events as any);

    const llmFactory = new LlmClientFactory(openai, deps.gptQueue, 'gpt-mock', 0);

    const createLlm = (config: any) => llmFactory.create(config, []).getRawClient();

    const pluginRegistry = createPluginRegistry({
        createLlm: createLlm as any,
        webSearch: deps.webSearch,
        imageSearch: deps.imageSearch,
        puppeteerHelper: deps.puppeteerHelper,
        puppeteerQueue: deps.puppeteerQueue,
        fetcher: deps.fetcher
    });

    for (const plugin of plugins) {
        pluginRegistry.override(plugin);
    }

    deps.pluginRegistry = pluginRegistry;
    deps.llmFactory = llmFactory;

    const executor = {
        runConfig: async (config: any, initialRows?: any[]) => {
            const configWithData = { ...config };
            if (initialRows && initialRows.length > 0) {
                configWithData.data = initialRows;
            }

            const schema = createPipelineSchema(pluginRegistry);
            const runtimeConfig = await schema.parseAsync(configWithData);

            // Create Step instances from the parsed config
            const stepDeps = {
                pluginRegistry: deps.pluginRegistry,
                events: deps.events,
                llmFactory: deps.llmFactory
            };
            const steps = runtimeConfig.steps.map((stepConfig: any, index: number) => 
                new Step(stepConfig, stepDeps, index)
            );

            const pipeline = new Pipeline(deps, steps, runtimeConfig);
            return pipeline.run();
        }
    };

    return {
        executor,
        openai,
        events,
        registry: pluginRegistry,
        deps
    };
}
