import { Command } from 'commander';
import { ContentProviderPlugin } from './types.js';

export class PluginRegistry {
    private plugins: Map<string, ContentProviderPlugin> = new Map();

    constructor() {}

    register(plugin: ContentProviderPlugin) {
        this.plugins.set(plugin.name, plugin);
    }

    get(name: string): ContentProviderPlugin | undefined {
        return this.plugins.get(name);
    }

    getAll(): ContentProviderPlugin[] {
        return Array.from(this.plugins.values());
    }

    configureCLI(program: Command) {
        const plugins = this.getAll();
        
        // 1. Global Registration
        for (const plugin of plugins) {
            plugin.register(program);
        }

        // 2. Step Registration (1-10)
        for (let i = 1; i <= 10; i++) {
            for (const plugin of plugins) {
                plugin.registerStep(program, i);
            }
        }
    }
}
