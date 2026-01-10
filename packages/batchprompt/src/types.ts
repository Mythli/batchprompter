import OpenAI from 'openai';

export interface PipelineItem {
    row: Record<string, any>;
    history: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    originalIndex: number;
    variationIndex?: number;
    stepHistory: Record<string, any>[];
    workspace: Record<string, any>;
}
