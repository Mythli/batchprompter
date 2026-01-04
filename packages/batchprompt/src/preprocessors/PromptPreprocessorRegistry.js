export class PromptPreprocessorRegistry {
    plugins = new Map();
    register(plugin) {
        this.plugins.set(plugin.name, plugin);
    }
    get(name) {
        return this.plugins.get(name);
    }
    getAll() {
        return Array.from(this.plugins.values());
    }
    configureCLI(program) {
        for (const plugin of this.getAll()) {
            plugin.register(program);
            for (let i = 1; i <= 10; i++) {
                plugin.registerStep(program, i);
            }
        }
    }
}
//# sourceMappingURL=PromptPreprocessorRegistry.js.map