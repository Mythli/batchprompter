import OpenAI from 'openai';
import { StepConfig } from '../types.js';
import { IImageSearchTool } from './IImageSearchTool.js';

export class ImageSearchToolNotConfigured implements IImageSearchTool {
    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: StepConfig,
        cacheSalt?: string | number
    ): Promise<{ contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[], savedPaths: string[] }> {
        
        // If the step does not require image search, we do nothing and return empty.
        if (!config.imageSearch) {
            return { contentParts: [], savedPaths: [] };
        }

        // If the step DOES require image search, we throw because this tool is only used when
        // the necessary API keys (SERPER_API_KEY) were not provided at startup.
        throw new Error(
            `Step ${stepIndex} requires Image Search, but the Image Search Tool is not configured. ` +
            `Please ensure the SERPER_API_KEY environment variable is set.`
        );
    }
}
