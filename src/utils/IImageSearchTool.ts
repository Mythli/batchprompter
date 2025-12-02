import OpenAI from 'openai';
import { StepConfig } from '../types.js';

export interface IImageSearchTool {
    execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: StepConfig,
        cacheSalt?: string | number
    ): Promise<{ contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[], savedPaths: string[] }>;
}
