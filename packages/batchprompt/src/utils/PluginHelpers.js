import Handlebars from 'handlebars';
import { PromptLoader } from '../src/config/PromptLoader.js';
export class PluginHelpers {
    /**
     * Resolves a ModelDefinition (paths/strings) into a ResolvedModelConfig (content parts).
     * Applies Handlebars substitution to the content.
     */
    static async resolveModelConfig(def, row, contentResolver) {
        const promptLoader = new PromptLoader(contentResolver);
        const systemParts = def.systemSource
            ? await promptLoader.load(def.systemSource)
            : [];
        const promptParts = def.promptSource
            ? await promptLoader.load(def.promptSource)
            : [];
        // Render content
        const render = (parts) => {
            return parts.map(part => {
                if (part.type === 'text') {
                    const template = Handlebars.compile(part.text, { noEscape: true });
                    return { type: 'text', text: template(row) };
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
//# sourceMappingURL=PluginHelpers.js.map