import { ContentResolver } from '../core/io/ContentResolver.js';

export class ConfigNormalizer {
    constructor(private contentResolver: ContentResolver) {}

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
                    for (const plugin of step.plugins) {
                        if (plugin.type === 'website-agent' || plugin.type === 'validation') {
                            if (plugin.schema && typeof plugin.schema === 'string') {
                                plugin.schema = await this.loadSchema(plugin.schema);
                            }
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
