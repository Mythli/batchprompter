export class ConfigNormalizer {
    contentResolver;
    pluginRegistry;
    constructor(contentResolver, pluginRegistry) {
        this.contentResolver = contentResolver;
        this.pluginRegistry = pluginRegistry;
    }
    async normalize(config) {
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
    async loadSchema(path) {
        try {
            const content = await this.contentResolver.readText(path);
            return JSON.parse(content);
        }
        catch (e) {
            throw new Error(`Failed to load schema from '${path}': ${e.message}`);
        }
    }
}
//# sourceMappingURL=ConfigNormalizer.js.map