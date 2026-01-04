import OpenAI from 'openai';
import { ContentResolver } from '../src/core/io/ContentResolver.js';
export declare class PromptResolver {
    private contentResolver;
    constructor(contentResolver: ContentResolver);
    /**
     * Resolves a prompt input (file path, raw text, or PromptDef object) into ContentParts.
     *
     * @param input The input string (file path or raw text) or PromptDef object.
     * @param context Optional data context for Handlebars rendering of the PATH itself.
     * @returns Promise<ChatCompletionContentPart[]>
     */
    resolve(input: string | any | undefined, context?: Record<string, any>): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]>;
}
//# sourceMappingURL=PromptResolver.d.ts.map