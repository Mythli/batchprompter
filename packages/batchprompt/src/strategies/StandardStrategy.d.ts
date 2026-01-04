import OpenAI from 'openai';
import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { StepConfig } from '../types.js';
import { MessageBuilder } from '../src/core/MessageBuilder.js';
import { BoundLlmClient } from '../src/core/BoundLlmClient.js';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from '../src/core/events.js';
export declare class StandardStrategy implements GenerationStrategy {
    private llm;
    private messageBuilder;
    private events;
    constructor(llm: BoundLlmClient, messageBuilder: MessageBuilder, events: EventEmitter<BatchPromptEvents>);
    private extractContent;
    private validateContent;
    execute(row: Record<string, any>, index: number, stepIndex: number, config: StepConfig, userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[], history: OpenAI.Chat.Completions.ChatCompletionMessageParam[], cacheSalt?: string | number, outputPathOverride?: string, skipCommands?: boolean, variationIndex?: number): Promise<GenerationResult>;
    private generateWithRetry;
}
//# sourceMappingURL=StandardStrategy.d.ts.map