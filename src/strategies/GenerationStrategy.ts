import OpenAI from 'openai';
import { StepConfig } from '../types.js';

export interface GenerationResult {
    historyMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam;
    columnValue: string | null;
}

export interface GenerationStrategy {
    execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: StepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        cacheSalt?: string | number,
        outputPathOverride?: string,
        skipCommands?: boolean
    ): Promise<GenerationResult>;
}
