import OpenAI from 'openai';
import { PromptDef } from './types.js';

/**
 * Interface for loading prompts.
 * Implementations should handle converting PromptDef to OpenAI content parts.
 */
export interface PromptLoader {
    load(prompt: PromptDef | undefined | null): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]>;
}
