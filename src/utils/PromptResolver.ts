import OpenAI from 'openai';
import { resolvePromptInput } from './fileUtils.js';
import Handlebars from 'handlebars';

export class PromptResolver {
    /**
     * Resolves a prompt input (file path or raw text) into ContentParts.
     * 
     * @param input The input string (file path or raw text).
     * @param context Optional data context for Handlebars rendering of the PATH itself.
     * @returns Promise<ChatCompletionContentPart[]>
     */
    static async resolve(input: string | undefined, context?: Record<string, any>): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        if (!input) return [];

        // 1. Check for Handlebars in the input string (Dynamic Path/Content)
        if (input.includes('{{')) {
            if (context) {
                // Render the path/content first
                const delegate = Handlebars.compile(input, { noEscape: true });
                const renderedInput = delegate(context);
                return resolvePromptInput(renderedInput);
            } else {
                // If no context provided (Pre-load phase), we cannot resolve dynamic paths.
                // We return a placeholder or empty, but ideally this shouldn't happen 
                // if the caller checks for dynamic paths before calling resolve without context.
                // For now, treat as raw text to be safe, or throw? 
                // Treating as raw text allows "I am {{name}}" to be passed through to the Normalizer later.
                return [{ type: 'text', text: input }];
            }
        }

        // 2. Static Path or Text
        return resolvePromptInput(input);
    }
}
