import { vi } from 'vitest';
import OpenAI from 'openai';
import PQueue from 'p-queue';
import { EventEmitter } from 'eventemitter3';
import { GlobalContext } from '../../src/types.js';
import { MemoryContentResolver } from '../../src/core/io/MemoryContentResolver.js';
import { LlmClientFactory } from '../../src/core/LlmClientFactory.js';
import { StepResolver } from '../../src/core/StepResolver.js';
import { MessageBuilder } from '../../src/core/MessageBuilder.js';
import { PluginRegistryV2, Plugin } from '../../src/plugins/types.js';
import { ActionRunner } from '../../src/ActionRunner.js';
import { InMemoryConfigExecutor } from '../../src/generator/InMemoryConfigExecutor.js';
import { DebugLogger } from '../../src/core/DebugLogger.js';
import { ValidationPluginV2 } from '../../src/plugins/validation/ValidationPluginV2.js';

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
                        response = responses[callCount] || responses[responses.length - 1] || "";
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

export function createTestContext(responses: (string | any)[] | MockResponseResolver = []) {
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
        capabilities: { hasSerper: false, hasPuppeteer: false },
        defaultModel: 'gpt-mock',
        contentResolver
    };

    return { globalContext, openai, events, contentResolver };
}

export interface TestEnvOptions {
    mockResponses?: (string | any)[] | MockResponseResolver;
    plugins?: Plugin[];
    schemaLoader?: any;
}

export function setupTestEnvironment(options: TestEnvOptions = {}) {
    const { mockResponses = [], plugins = [], schemaLoader = { load: async () => ({}) } } = options;

    const { globalContext, openai, events, contentResolver } = createTestContext(mockResponses);

    // Add DebugLogger to see events in test output
    new DebugLogger(events as any);

    const llmFactory = new LlmClientFactory(openai, globalContext.gptQueue, 'gpt-mock');
    const stepResolver = new StepResolver(llmFactory, globalContext, schemaLoader);
    const messageBuilder = new MessageBuilder();
    const pluginRegistry = new PluginRegistryV2();

    // Always register ValidationPluginV2 as it's a core plugin often used in tests
    pluginRegistry.register(new ValidationPluginV2());

    for (const plugin of plugins) {
        // Avoid double registration if passed in options
        if (!pluginRegistry.get(plugin.type)) {
            pluginRegistry.register(plugin);
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
