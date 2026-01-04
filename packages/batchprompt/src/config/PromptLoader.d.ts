import OpenAI from 'openai';
import { PromptDef } from './types.js';
import { ContentResolver } from '../core/io/ContentResolver.js';
/**
 * Loads and converts prompt definitions to OpenAI content parts
 */
export declare class PromptLoader {
    private contentResolver;
    private cache;
    constructor(contentResolver: ContentResolver);
    load(prompt: PromptDef | undefined | null): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]>;
    private loadString;
    private loadParts;
    clearCache(): void;
}
//# sourceMappingURL=PromptLoader.d.ts.map