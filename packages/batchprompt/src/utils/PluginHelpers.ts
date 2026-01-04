import OpenAI from 'openai';
import Handlebars from 'handlebars';
import { PromptLoader } from '../config/PromptLoader.js';
import { ModelDefinition } from '../types.js';
import { ResolvedModelConfig } from '../config/types.js';
import { ContentResolver } from '../core/io/ContentResolver.js';

export class PluginHelpers {

    /**
     * Resolves a ModelDefinition (paths/strings) into a ResolvedModelConfig (content parts).
     * Applies Handlebars substitution to the content.
     */
    static async resolveModelConfig(
        def: ModelDefinition,
        row: Record<string, any>,
        contentResolver: ContentResolver
    ): Promise<ResolvedModelConfig> {

        const promptLoader = new PromptLoader(contentResolver);

        const systemParts = def.systemSource
            ? await promptLoader.load(def.systemSource)
            : [];

        const promptParts = def.promptSource
            ? await promptLoader.load(def.promptSource)
            : [];

        // Render content
        const render = (parts: OpenAI.Chat.Completions.ChatCompletionContentPart[]): OpenAI.Chat.Completions.ChatCompletionContentPart[] => {
            return parts.map(part => {
                if (part.type === 'text') {
                    const template = Handlebars.compile(part.text, { noEscape: true });
                    return { type: 'text' as const, text: template(row) };
                }
                return part;
            });
        };

        return {
            model: def.model,
            temperature: def.temperature,
            thinkingLevel: def.thinkingLevel,
            systemParts: render(systemParts),
            promptParts: render(promptParts)
        };
    }
}
