import { Command } from 'commander';
import { PromptPreprocessorPlugin } from './types.js';

export class PromptPreprocessorRegistry {
    private plugins: Map<string, PromptPreprocessorPlugin> = new Map();

    register(plugin: PromptPreprocessorPlugin) {
        this.plugins.set(plugin.name, plugin);
    }

    getAll(): PromptPreprocessorPlugin[] {
        return Array.from(this.plugins.values());
    }

    configureCLI(program: Command) {
        for (const plugin of this.getAll()) {
            plugin.register(program);
            for (let i = 1; i <= 10; i++) {
                plugin.registerStep(program, i);
            }
        }
    }
}
