import OpenAI from 'openai';
import { createLlm } from 'llm-fns';
import { Cache } from 'cache-manager';
import PQueue from 'p-queue';
import { ResolvedModelConfig } from '../types.js';
import { BoundLlmClient } from './BoundLlmClient.js';

export class LlmClientFactory {
    constructor(
        private openai: OpenAI,
        private cache: Cache | undefined,
        private queue: PQueue,
        private defaultModel: string
    ) {}

    /**
     * Creates a BoundLlmClient from a ResolvedModelConfig.
     * The returned client has the system and prompt parts bound.
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
            queue: this.queue
        });

        return new BoundLlmClient(
            rawClient,
            config.systemParts || [],
            config.promptParts || []
        );
    }
}
