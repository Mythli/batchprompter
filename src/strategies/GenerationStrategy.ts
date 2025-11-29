import OpenAI from 'openai';
import { ResolvedStepConfig } from '../StepConfigurator.js';

export interface GenerationResult {
    historyMessage: { role: 'assistant', content: string };
    columnValue: string | null;
}

export interface GenerationStrategy {
    execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: ResolvedStepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        cacheSalt?: string | number,
        outputPathOverride?: string
    ): Promise<GenerationResult>;
}
