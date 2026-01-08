import { vi } from 'vitest';
import OpenAI from 'openai';
import PQueue from 'p-queue';
import { EventEmitter } from 'eventemitter3';
import { GlobalContext } from '../../src/types.js';
import { MemoryContentResolver } from '../../src/core/io/MemoryContentResolver.js';
import { LlmClientFactory } from '../../src/core/LlmClientFactory.js';
import { StepResolver } from '../../src/core/StepResolver.js';
import { MessageBuilder } from '../../src/core/MessageBuilder.js';
import { Plugin, createPluginRegistry } from '../../src/plugins/index.js';
import { ActionRunner } from '../../src/ActionRunner.js';
import { InMemoryConfigExecutor } from '../../src/generator/InMemoryConfigExecutor.js';
import { PromptLoader } from '../../src/config/PromptLoader.js';
import { getPromptSummary, LlmFatalError } from 'llm-fns';
import { StepOrchestrator } from '../../src/core/StepOrchestrator.js';
import { PluginExecutor } from '../../src/core/PluginExecutor.js';
import { StepExecutor } from '../../src/StepExecutor.js';
import { DebugLogger } from "../../src/index.js";

export type MockResponseResolver = (messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) => string | any;

export function createMockOpenAI(responses: (string | any)[] | MockResponseResolver) {
    let callCount = 0;
    return {
        chat: {
            completions: {
                create: vi.fn(async (params) => {
                    if (!params.messages || params.messages.length === 0) {
                        throw new LlmFatalError(
                            `[Mock OpenAI] 400 Input required: specify "prompt" or "messages"`,
                            undefined,
                            params.messages
                        );
                    }

                    let response: string | any;
                    const currentCall = callCount + 1;
                    const summary = getPromptSummary(params.messages);

                    console.log(`\n--- [Mock OpenAI] Call #${currentCall} ---`);
                    console.log(`Prompt: ${summary}`);

                    if (typeof responses === 'function') {
                        response = responses(params.messages);
                        if (response === undefined || response === null) {
                            throw new LlmFatalError(
                                `[Mock OpenAI] Resolver function returned null/undefined.\n` +
                                `Requested Call: #${currentCall}\n` +
                                `Prompt Summary: ${summary}\n\n` +
                                `Check your mock resolver logic to ensure it returns a valid response for this prompt.`,
                                undefined,
                                params.messages
                            );
                        }
                        console.log(`Response (Resolver): ${typeof response === 'string' ? response : JSON.stringify(response, null, 2)}`);
                        callCount++;
                    } else {
                        if (callCount >= responses.length) {
                            throw new LlmFatalError(
                                `[Mock OpenAI] No more responses configured.\n` +
                                `Requested Call: #${currentCall}\n` +
                                `Configured Responses: ${responses.length}\n` +
                                `Prompt Summary: ${summary}\n\n` +
                                `Please check responses in your mock configuration array.`,
                                undefined,
                                params.messages
                            );
                        }
                        response = responses[callCount];
                        console.log(`Response (Array[${callCount}]): ${typeof response === 'string' ? response : JSON.stringify(response, null, 2)}`);
                        callCount++;
                    }
                    console.log(`---------------------------------------\n`);

                    // If response is a string, wrap it in a standard text message
                    if (typeof response === 'string') {
                        return {
                            id: 'mock-id',
                            choices: [{
                                message: { content: response }
                            }]
                        };
                    }

                    // If response is an object, assume it's a full message object (e.g. for images/audio)
                    // or a partial choice object
                    return {
                        id: 'mock-id',
                        choices: [{
                            message: response
                        }]
                    };
                })
            }
        }
    } as unknown as OpenAI;
}

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
    };

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
    const stepResolver = new StepResolver(llmFactory, globalContext, schemaLoader);
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

    const pluginExecutor = new PluginExecutor(events as any, '/tmp');
    const stepExecutor = new StepExecutor(events as any);

    const stepOrchestrator = new StepOrchestrator(
        globalContext,
        pluginRegistry,
        stepResolver,
        messageBuilder,
        pluginExecutor,
        stepExecutor
    );

    const actionRunner = new ActionRunner(
        globalContext,
        stepOrchestrator
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
