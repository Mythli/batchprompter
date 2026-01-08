import { RuntimeConfig } from './types.js';
import { createPipelineSchema } from './schema.js';
import { PluginRegistryV2 } from '../plugins/types.js';
import { z } from 'zod';
import { zJsonSchemaObject } from './validationRules.js';

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
    // 0. Get Dynamic Plugin Schema
    const pluginUnion = deps.pluginRegistry.getSchema();

    // 1. Create Schema
    // We use zJsonSchemaObject for strict validation of schemas, 
    // or allow strings if we want to support file paths for schemas (but we removed file loading).
    // If schemas are inline objects, zJsonSchemaObject is correct.
    // If schemas are template strings (e.g. "{{schema}}"), we might need z.union([z.string(), zJsonSchemaObject]).
    const PipelineSchema = createPipelineSchema(
        pluginUnion,
        z.union([z.string(), zJsonSchemaObject])
    );

    // 2. Preprocess Shortcuts (URL Expander)
    // We need to do this before parsing because the schema expects plugins to be in the array.
    const preprocessedConfig = expandShortcuts(rawConfig);

    // 3. Parse & Transform
    // This handles validation, normalization, inheritance, and transformation to messages.
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
