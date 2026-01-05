import { vi } from 'vitest';
import OpenAI from 'openai';
import PQueue from 'p-queue';
import { EventEmitter } from 'eventemitter3';
import { GlobalContext } from '../../src/types.js';
import { MemoryContentResolver } from '../../src/core/io/MemoryContentResolver.js';
import { LlmClientFactory } from '../../src/core/LlmClientFactory.js';
import { StepResolver } from '../../src/core/StepResolver.js';
import { MessageBuilder } from '../../src/core/MessageBuilder.js';
import { PluginRegistryV2, Plugin, createPluginRegistry } from '../../src/plugins/index.js';
import { ActionRunner } from '../../src/ActionRunner.js';
import { InMemoryConfigExecutor } from '../../src/generator/InMemoryConfigExecutor.js';
import { DebugLogger } from '../../src/core/DebugLogger.js';
import { PromptLoader } from '../../src/config/PromptLoader.js';

export type MockResponseResolver = (messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) => string | any;

export function createMockOpenAI(responses: (string | any)[] | MockResponseResolver) {
    let callCount = 0;
    return {
        chat: {
            completions: {
                create: vi.fn(async (params) => {
                    let response: string | any;

                    if (typeof responses === 'function') {
                        response = responses(params.messages);
                    } else {
                        if (callCount >= responses.length) {
                            throw new Error(`Mock OpenAI: No more responses configured (requested call #${callCount + 1})`);
                        }
                        response = responses[callCount];
                        callCount++;
                    }

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
        fetcher: vi.fn() as any,
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

    const llmFactory = new LlmClientFactory(openai, globalContext.gptQueue, 'gpt-mock');
    const stepResolver = new StepResolver(llmFactory, globalContext, schemaLoader);
    const messageBuilder = new MessageBuilder();
    
    const promptLoader = new PromptLoader(contentResolver);
    const pluginRegistry = createPluginRegistry(promptLoader);

    for (const plugin of plugins) {
        try {
            pluginRegistry.register(plugin);
        } catch (e) {
            // If already registered (built-in), we ignore.
        }
    }

    const actionRunner = new ActionRunner(
        globalContext,
        pluginRegistry,
        stepResolver,
        messageBuilder
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
