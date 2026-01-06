import { z } from 'zod';
import { PluginRegistryV2 } from '../plugins/types.js';

export class ConfigExpander {
    static expand(config: any, registry: PluginRegistryV2): any {
        const expanded = JSON.parse(JSON.stringify(config)); // Deep clone

        if (expanded.steps) {
            for (const step of expanded.steps) {
                step.plugins = step.plugins || [];
                
                for (const plugin of registry.getAll()) {
                    if (plugin.mapStepToConfig) {
                        const pluginConfig = plugin.mapStepToConfig(step);
                        if (pluginConfig) {
                            // Add to plugins
                            step.plugins.unshift(pluginConfig);
                            
                            // Remove the trigger keys from step to pass strict validation
                            // We use the stepExtensionSchema to identify which keys belong to this plugin's shortcut
                            if (plugin.stepExtensionSchema && plugin.stepExtensionSchema instanceof z.ZodObject) {
                                const keys = Object.keys(plugin.stepExtensionSchema.shape);
                                for (const key of keys) {
                                    delete step[key];
                                }
                            }
                        }
                    }
                }
            }
        }
        return expanded;
    }
}
