import { RuntimeConfig } from './types.js';
import { createPipelineSchemaFactory } from './schema.js';
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
    // 1. Preprocess Shortcuts (Plugin Hooks)
    const preprocessedConfig = preprocessConfig(rawConfig, deps.pluginRegistry);

    // 2. Create Schema Factory
    const createSchema = createPipelineSchemaFactory(deps.pluginRegistry);
    
    // 3. Create the Schema based on the input data
    const PipelineSchema = await createSchema(preprocessedConfig);

    // 4. Parse & Transform using the custom-built schema
    const config = await PipelineSchema.parseAsync(preprocessedConfig);

    return config as RuntimeConfig;
}

function preprocessConfig(config: any, registry: PluginRegistryV2): any {
    if (!config || typeof config !== 'object') return config;
    const expanded = JSON.parse(JSON.stringify(config));

    if (expanded.steps && Array.isArray(expanded.steps)) {
        const plugins = registry.getAll();
        for (const step of expanded.steps) {
            for (const plugin of plugins) {
                if (plugin.preprocessStep) {
                    plugin.preprocessStep(step);
                }
            }
        }
    }
    return expanded;
}
