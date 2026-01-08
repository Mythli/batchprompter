import {EventEmitter} from "eventemitter3";
import OpenAI from "openai";
import {getPromptSummary} from "./util.js";
import {LlmFatalError} from "./createLlmClient.js";
import { vi } from "vitest";
export type MockResponseResolver = (messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) => string | any;

export function createMockOpenAI(responses: (string | any)[] | MockResponseResolver) {
    let callCount = 0;
    return {
        chat: {
            completions: {
                create: vi.fn(async (params) => {
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
