import OpenAI from 'openai';
import { createLlm } from 'llm-fns';
import PQueue from 'p-queue';
import { ModelConfig } from './config/index.js';
import { BoundLlmClient } from './BoundLlmClient.js';

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

        if (config.thinkingLevel) {
            modelConfig.reasoning_effort = config.thinkingLevel;
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
