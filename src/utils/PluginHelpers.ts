import OpenAI from 'openai';
import Handlebars from 'handlebars';
import { PromptResolver } from './PromptResolver.js';
import { ModelDefinition, ResolvedModelConfig } from '../types.js';

export class PluginHelpers {
    
    /**
     * Resolves a ModelDefinition (paths/strings) into a ResolvedModelConfig (content parts).
     * Applies Handlebars substitution to the content.
     */
    static async resolveModelConfig(
        def: ModelDefinition, 
        row: Record<string, any>
    ): Promise<ResolvedModelConfig> {
        
        const systemParts = def.systemSource 
            ? await PromptResolver.resolve(def.systemSource, row) 
            : [];
            
        const promptParts = def.promptSource 
            ? await PromptResolver.resolve(def.promptSource, row) 
            : [];

        // Render content
        const render = (parts: OpenAI.Chat.Completions.ChatCompletionContentPart[]) => {
            return parts.map(part => {
                if (part.type === 'text') {
                    return { type: 'text', text: Handlebars.compile(part.text, { noEscape: true })(row) };
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
