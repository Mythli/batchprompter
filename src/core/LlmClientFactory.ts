import OpenAI from 'openai';
import { createLlm, LlmClient } from 'llm-fns';
import { Cache } from 'cache-manager';
import PQueue from 'p-queue';
import { LlmModelConfig } from '../types.js';

export class LlmClientFactory {
    constructor(
        private openai: OpenAI,
        private cache: Cache | undefined,
        private queue: PQueue,
        private defaultModel: string
    ) {}

    create(config: LlmModelConfig): LlmClient {
        const modelConfig: Record<string, any> = {
            model: config.model || this.defaultModel
        };

        if (config.temperature !== undefined) {
            modelConfig.temperature = config.temperature;
        }

        if (config.thinkingLevel) {
            modelConfig.reasoning_effort = config.thinkingLevel;
        }

        return createLlm({
            openai: this.openai as any,
            defaultModel: modelConfig,
            queue: this.queue
        });
    }

    createFromResolved(config: { model?: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }): LlmClient {
        return this.create({
            model: config.model || this.defaultModel,
            temperature: config.temperature,
            thinkingLevel: config.thinkingLevel
        });
    }
}
