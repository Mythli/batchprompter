import { ContentResolver } from '../core/io/ContentResolver.js';
import { PluginRegistryV2 } from '../plugins/types.js';

export class ConfigNormalizer {
    constructor(
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
                    step.schema = await this.loadSchema(step.schema);
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

    private async loadSchema(path: string): Promise<any> {
        try {
            const content = await this.contentResolver.readText(path);
            return JSON.parse(content);
        } catch (e: any) {
            throw new Error(`Failed to load schema from '${path}': ${e.message}`);
        }
    }
}
