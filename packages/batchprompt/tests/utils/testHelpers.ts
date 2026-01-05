import { vi } from 'vitest';
import OpenAI from 'openai';
import PQueue from 'p-queue';
import { EventEmitter } from 'eventemitter3';
import { GlobalContext } from '../../src/types.js';
import { MemoryContentResolver } from '../../src/core/io/MemoryContentResolver.js';

export function createMockOpenAI(responses: (string | any)[]) {
    let callCount = 0;
    return {
        chat: {
            completions: {
                create: vi.fn(async (params) => {
                    const response = responses[callCount] || responses[responses.length - 1] || "";
                    callCount++;

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

export function createTestContext(responses: (string | any)[] = []) {
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
