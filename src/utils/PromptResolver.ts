import OpenAI from 'openai';
import { resolvePromptInput } from './fileUtils.js';
import Handlebars from 'handlebars';

export class PromptResolver {
    /**
     * Resolves a prompt input (file path, raw text, or PromptDef object) into ContentParts.
     * 
     * @param input The input string (file path or raw text) or PromptDef object.
     * @param context Optional data context for Handlebars rendering of the PATH itself.
     * @returns Promise<ChatCompletionContentPart[]>
     */
    static async resolve(input: string | any | undefined, context?: Record<string, any>): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        if (!input) return [];

        // Handle PromptDef object
        if (typeof input === 'object') {
            if (input.text) {
                return [{ type: 'text', text: input.text }];
            }
            if (input.file) {
                return this.resolve(input.file, context);
            }
            if (input.parts && Array.isArray(input.parts)) {
                const results: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
                for (const part of input.parts) {
                    if (part.type === 'text') {
                        results.push({ type: 'text', text: part.content });
                    } else if (part.type === 'image') {
                        if (part.content.startsWith('http') || part.content.startsWith('data:')) {
                            results.push({ type: 'image_url', image_url: { url: part.content } });
                        } else {
                            try {
                                const loaded = await resolvePromptInput(part.content);
                                results.push(...loaded);
                            } catch (e) {
                                console.warn(`Failed to load image part from ${part.content}`);
                            }
                        }
                    } else if (part.type === 'audio') {
                         try {
                             const loaded = await resolvePromptInput(part.content);
                             results.push(...loaded);
                         } catch (e) {
                             console.warn(`Failed to load audio part from ${part.content}`);
                         }
                    }
                }
                return results;
            }
            return [];
        }

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
