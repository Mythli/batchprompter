import { SchemaLoader } from './SchemaLoader.js';
import { PluginRegistryV2 } from '../plugins/types.js';
import { ContentResolver } from '../core/io/ContentResolver.js';
import { PromptLoader } from './PromptLoader.js';

export class ConfigNormalizer {
    constructor(
        private schemaLoader: SchemaLoader,
        private contentResolver: ContentResolver,
        private pluginRegistry: PluginRegistryV2,
        private promptLoader?: PromptLoader
    ) {}

    async normalize(config: any): Promise<any> {
        // Deep clone to avoid mutation
        const normalized = JSON.parse(JSON.stringify(config));

        if (normalized.steps) {
            for (const step of normalized.steps) {
                // Normalize Step Schema
                if (step.schema && typeof step.schema === 'string') {
                    // Skip templates - they'll be resolved at runtime
                    if (!step.schema.includes('{{')) {
                        try {
                            step.schema = await this.schemaLoader.load(step.schema);
                        } catch (e) {
                            // If loading fails, leave as string for better error messages later
                        }
                    }
                }

                // Normalize Prompts (only static paths, not templates)
                if (this.promptLoader) {
                    // Model prompts
                    if (step.model) {
                        if (step.model.prompt) {
                            step.model.prompt = await this.hydratePrompt(step.model.prompt);
                        }
                        if (step.model.system) {
                            step.model.system = await this.hydratePrompt(step.model.system);
                        }
                    }

                    // Top-level prompts (convenience syntax)
                    if (step.prompt) {
                        step.prompt = await this.hydratePrompt(step.prompt);
                    }
                    if (step.system) {
                        step.system = await this.hydratePrompt(step.system);
                    }

                    // Judge prompts
                    if (step.judge) {
                        if (step.judge.prompt) {
                            step.judge.prompt = await this.hydratePrompt(step.judge.prompt);
                        }
                        if (step.judge.system) {
                            step.judge.system = await this.hydratePrompt(step.judge.system);
                        }
                    }

                    // Feedback prompts
                    if (step.feedback) {
                        if (step.feedback.prompt) {
                            step.feedback.prompt = await this.hydratePrompt(step.feedback.prompt);
                        }
                        if (step.feedback.system) {
                            step.feedback.system = await this.hydratePrompt(step.feedback.system);
                        }
                    }
                }

                // Normalize Plugin Configs
                if (step.plugins) {
                    for (let i = 0; i < step.plugins.length; i++) {
                        const pluginConfig = step.plugins[i];
                        const plugin = this.pluginRegistry.get(pluginConfig.type);
                        
                        if (plugin && plugin.normalizeConfig) {
                            step.plugins[i] = await plugin.normalizeConfig(pluginConfig, this.contentResolver);
                        }
                    }
                }
            }
        }

        return normalized;
    }

    /**
     * Hydrates a prompt definition if it's a static file path.
     * Templates (containing {{) are left as-is for runtime resolution.
     */
    private async hydratePrompt(prompt: any): Promise<any> {
        if (!this.promptLoader) {
            return prompt;
        }

        // Already hydrated (array of content parts)
        if (Array.isArray(prompt)) {
            return prompt;
        }

        // String: could be file path or raw text
        if (typeof prompt === 'string') {
            // Skip templates - they'll be resolved at runtime
            if (prompt.includes('{{')) {
                return prompt;
            }

            // Try to load as file
            try {
                return await this.promptLoader.load(prompt);
            } catch (e) {
                // If loading fails, return as-is (might be raw text)
                return prompt;
            }
        }

        // Object with file property
        if (typeof prompt === 'object' && prompt !== null && prompt.file) {
            if (prompt.file.includes('{{')) {
                return prompt;
            }
            try {
                return await this.promptLoader.load(prompt);
            } catch (e) {
                return prompt;
            }
        }

        return prompt;
    }
}
