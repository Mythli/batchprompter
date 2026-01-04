// =============================================================================
// Plugin Registry
// =============================================================================
/**
 * Registry for plugins
 */
export class PluginRegistryV2 {
    plugins = new Map();
    register(plugin) {
        if (this.plugins.has(plugin.type)) {
            throw new Error(`Plugin '${plugin.type}' is already registered`);
        }
        this.plugins.set(plugin.type, plugin);
    }
    get(type) {
        return this.plugins.get(type);
    }
    getAll() {
        return Array.from(this.plugins.values());
    }
    /**
     * Register CLI options from all plugins with Commander
     */
    registerCLI(program) {
        for (const plugin of this.getAll()) {
            // Global options
            for (const opt of plugin.cliOptions) {
                if (opt.parser) {
                    program.option(opt.flags, opt.description, opt.parser, opt.defaultValue);
                }
                else if (opt.defaultValue !== undefined) {
                    program.option(opt.flags, opt.description, opt.defaultValue);
                }
                else {
                    program.option(opt.flags, opt.description);
                }
            }
            // Step-specific options (1-10)
            for (let i = 1; i <= 10; i++) {
                for (const opt of plugin.cliOptions) {
                    const stepFlags = this.makeStepFlags(opt.flags, i);
                    if (opt.parser) {
                        program.option(stepFlags, `${opt.description} for step ${i}`, opt.parser);
                    }
                    else {
                        program.option(stepFlags, `${opt.description} for step ${i}`);
                    }
                }
            }
        }
    }
    /**
     * Validate that required capabilities are available for all plugins in config
     */
    validateCapabilities(stepConfigs, capabilities) {
        for (let stepIdx = 0; stepIdx < stepConfigs.length; stepIdx++) {
            const step = stepConfigs[stepIdx];
            for (const pluginConfig of step.plugins) {
                const plugin = this.get(pluginConfig.type);
                if (!plugin) {
                    throw new Error(`Unknown plugin type: ${pluginConfig.type}`);
                }
                const required = plugin.getRequiredCapabilities();
                for (const cap of required) {
                    if (!capabilities[cap]) {
                        throw new Error(`Step ${stepIdx + 1}: Plugin '${pluginConfig.type}' requires '${String(cap)}' which is not available.`);
                    }
                }
            }
        }
    }
    makeStepFlags(flags, stepIndex) {
        // Convert "--web-search-query <text>" to "--web-search-query-1 <text>"
        return flags.replace(/^(--[\w-]+)/, `$1-${stepIndex}`);
    }
}
//# sourceMappingURL=types.js.map