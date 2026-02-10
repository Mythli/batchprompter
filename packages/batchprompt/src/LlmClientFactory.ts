import OpenAI from 'openai';
import { createLlm } from 'llm-fns';
import PQueue from 'p-queue';
import { BoundLlmClient } from './BoundLlmClient.js';
import {ModelConfig} from "./config/model.js";

export class LlmClientFactory {
    constructor(
        private openai: OpenAI,
        private queue: PQueue,
        private defaultModel: string,
        private retryBaseDelay?: number
    ) {}

    /**
     * Creates a BoundLlmClient.
     * @param config The resolved model config (model, temp, etc)
     * @param messages The fully hydrated messages to bind
     */
    create(
        config: ModelConfig,
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    ): BoundLlmClient {
        const modelConfig: Record<string, any> = {
            model: config.model || this.defaultModel
        };

        if (config.temperature !== undefined) {
            modelConfig.temperature = config.temperature;
        }

        // reasoning_effort is set from either reasoning_effort or thinkingLevel
        // (resolved in transformModelConfig)
        if (config.reasoning_effort) {
            modelConfig.reasoning_effort = config.reasoning_effort;
        }

        const rawClient = createLlm({
            openai: this.openai as any,
            defaultModel: modelConfig,
            queue: this.queue,
            retryBaseDelay: this.retryBaseDelay,
        });

        return new BoundLlmClient(rawClient, messages);
    }
}
