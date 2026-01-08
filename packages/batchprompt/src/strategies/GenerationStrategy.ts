import OpenAI from 'openai';

export interface GenerationResult {
    historyMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam;
    columnValue: string | null;
    raw?: any;
    /**
     * If the generation strategy executed multiple times (e.g. due to plugin explosion),
     * this array contains the individual results.
     */
    explodedResults?: GenerationResult[];
}

export interface GenerationStrategy {
    execute(cacheSalt?: string | number): Promise<GenerationResult>;
}
