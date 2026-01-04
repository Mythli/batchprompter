import { SchemaLoader } from './SchemaLoader.js';
import { PluginRegistryV2 } from '../plugins/types.js';
import { ContentResolver } from '../core/io/ContentResolver.js';

export class ConfigNormalizer {
    constructor(
        private schemaLoader: SchemaLoader,
        private contentResolver: ContentResolver,
        private pluginRegistry: PluginRegistryV2
    ) {}

    async normalize(config: any): Promise<any> {
        // Deep clone to avoid mutation
        const normalized = JSON.parse(JSON.stringify(config));

        if (normalized.steps) {
            for (const step of normalized.steps) {
                // Normalize Step Schema
                if (step.schema && typeof step.schema === 'string') {
                    try {
                        step.schema = await this.schemaLoader.load(step.schema);
                    } catch (e) {
                        // If loading fails (e.g. dynamic path), leave it as string
                        // It will be resolved at runtime by StepResolver
                    }
                }

                // Normalize Plugin Schemas
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
}
