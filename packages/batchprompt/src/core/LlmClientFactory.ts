import OpenAI from 'openai';
import { createLlm } from 'llm-fns';
import PQueue from 'p-queue';
import { ResolvedModelConfig } from '../config/types.js';
import { BoundLlmClient } from './BoundLlmClient.js';

export class LlmClientFactory {
    constructor(
        private openai: OpenAI,
        private queue: PQueue,
        private defaultModel: string,
        private retryBaseDelay?: number
    ) {}

    /**
     * Creates a BoundLlmClient from a ResolvedModelConfig.
     */
    create(config: ResolvedModelConfig): BoundLlmClient {
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
            retryBaseDelay: this.retryBaseDelay
        });

        return new BoundLlmClient(
            rawClient,
            config.systemParts || [],
            config.promptParts || []
        );
    }
}
