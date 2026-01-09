import { RuntimeConfig } from './types.js';
import { createPipelineSchema } from './schema.js';
import { PluginRegistryV2 } from '../plugins/types.js';

export interface ResolveConfigDependencies {
    pluginRegistry: PluginRegistryV2;
}

/**
 * Single entry point for resolving raw configuration into RuntimeConfig.
 * Now purely schema-based.
 */
export async function resolveConfig(
    rawConfig: unknown,
    deps: ResolveConfigDependencies
): Promise<RuntimeConfig> {
    // 1. Preprocess Shortcuts (URL Expander)
    const preprocessedConfig = expandShortcuts(rawConfig);

    // 2. Create Schema with Registry
    const PipelineSchema = createPipelineSchema(deps.pluginRegistry);

    // 3. Parse & Transform
    const config = await PipelineSchema.parseAsync(preprocessedConfig);

    return config as RuntimeConfig;
}

function expandShortcuts(config: any): any {
    if (!config || typeof config !== 'object') return config;
    const expanded = JSON.parse(JSON.stringify(config));

    if (expanded.steps) {
        for (const step of expanded.steps) {
            step.plugins = step.plugins || [];
            
            if (step.expandUrls !== undefined && step.expandUrls !== false) {
                const isExplicitlyConfigured = step.plugins.some(
                    (p: any) => p.type === 'url-expander'
                );

                if (!isExplicitlyConfigured) {
                    let pluginConfig: any = {
                        type: 'url-expander',
                        output: { mode: 'ignore', explode: false },
                        mode: 'fetch',
                        maxChars: 30000
                    };

                    if (typeof step.expandUrls === 'object') {
                        pluginConfig = { ...pluginConfig, ...step.expandUrls };
                    }

                    step.plugins.unshift(pluginConfig);
                }
            }
        }
    }
    return expanded;
}
