import OpenAI from 'openai';
import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { StandardStrategy } from './StandardStrategy.js';
import { StepConfig, StepContext } from '../types.js';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from '../src/core/events.js';
export declare class CandidateStrategy implements GenerationStrategy {
    private standardStrategy;
    private stepContext;
    private events;
    constructor(standardStrategy: StandardStrategy, stepContext: StepContext, events: EventEmitter<BatchPromptEvents>);
    execute(row: Record<string, any>, index: number, stepIndex: number, config: StepConfig, userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[], history: OpenAI.Chat.Completions.ChatCompletionMessageParam[], cacheSalt?: string | number, outputPathOverride?: string, skipCommands?: boolean, variationIndex?: number): Promise<GenerationResult>;
    private judgeCandidates;
}
//# sourceMappingURL=CandidateStrategy.d.ts.map