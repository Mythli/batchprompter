import OpenAI from 'openai';
import { StepConfig, StepContext } from './types.js';
import { MessageBuilder } from './src/core/MessageBuilder.js';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from './src/core/events.js';
export interface StepExecutionResult {
    historyMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam;
    modelResult: any;
}
export declare class StepExecutor {
    private events;
    private messageBuilder;
    constructor(events: EventEmitter<BatchPromptEvents>, messageBuilder: MessageBuilder);
    executeModel(stepContext: StepContext, viewContext: Record<string, any>, index: number, stepIndex: number, config: StepConfig, history: OpenAI.Chat.Completions.ChatCompletionMessageParam[], pluginContentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[], variationIndex?: number): Promise<StepExecutionResult>;
}
//# sourceMappingURL=StepExecutor.d.ts.map