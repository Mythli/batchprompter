import OpenAI from 'openai';
import PQueue from 'p-queue';
import { ResolvedModelConfig } from '../../types.js';
import { BoundLlmClient } from './BoundLlmClient.js';
export declare class LlmClientFactory {
    private openai;
    private queue;
    private defaultModel;
    constructor(openai: OpenAI, queue: PQueue, defaultModel: string);
    /**
     * Creates a BoundLlmClient from a ResolvedModelConfig.
     * The returned client has the system and prompt parts bound.
     */
    create(config: ResolvedModelConfig): BoundLlmClient;
}
//# sourceMappingURL=LlmClientFactory.d.ts.map