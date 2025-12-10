import { Command } from 'commander';
import { ContentProviderPlugin } from './types.js';
import { ServiceCapabilities } from '../types.js';

export class PluginRegistry {
    private plugins: Map<string, ContentProviderPlugin> = new Map();

    constructor(private capabilities: ServiceCapabilities) {}

    register(plugin: ContentProviderPlugin) {
        this.plugins.set(plugin.name, plugin);
    }

    get(name: string): ContentProviderPlugin | undefined {
        return this.plugins.get(name);
    }

    getAll(): ContentProviderPlugin[] {
        return Array.from(this.plugins.values());
    }

    getCapabilities(): ServiceCapabilities {
        return this.capabilities;
    }

    configureCLI(program: Command) {
        const plugins = this.getAll();
        
        for (const plugin of plugins) {
            plugin.register(program);
            program.option(`--${plugin.name}-output <column>`, `Save ${plugin.name} result to column`);
            program.option(`--${plugin.name}-export`, `Merge ${plugin.name} result into row`);
            program.option(`--${plugin.name}-explode`, `Explode ${plugin.name} array result into multiple rows`);
        }

        for (let i = 1; i <= 10; i++) {
            for (const plugin of plugins) {
                plugin.registerStep(program, i);
                program.option(`--${plugin.name}-output-${i} <column>`, `Save ${plugin.name} result to column for step ${i}`);
                program.option(`--${plugin.name}-export-${i}`, `Merge ${plugin.name} result into row for step ${i}`);
                program.option(`--${plugin.name}-explode-${i}`, `Explode ${plugin.name} result for step ${i}`);
            }
        }
    }
}
