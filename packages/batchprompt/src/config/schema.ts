import { z } from 'zod';
import { PluginRegistryV2 } from '../plugins/types.js';
import { getGlobalsSchema, getStepBaseSchema } from './base.js';
import { mergeModelConfigs, transformModelConfig, resolveModelConfig } from './schemas/index.js';

export const createPipelineSchema = (registry: PluginRegistryV2 = new PluginRegistryV2()) => {
    // Extend StepBaseSchema with Plugin Extensions
    let ExtendedStepBaseSchema = getStepBaseSchema();
    const plugins = registry.getAll();

    for (const plugin of plugins) {
        if (plugin.getStepExtensionSchema) {
            const extension = plugin.getStepExtensionSchema();
            if (extension) {
                ExtendedStepBaseSchema = ExtendedStepBaseSchema.extend(extension as any) as any;
            }
        }
    }

    // Define the Step Schema with loose plugins array for input
    const StepInputSchema = ExtendedStepBaseSchema.extend({
        plugins: z.array(z.record(z.string(), z.any())).default([])
    });

    // Define the Root Schema
    const RootSchema = getGlobalsSchema().extend({
        steps: z.array(StepInputSchema).min(1)
    });

    // Preprocess function
    const preprocess = (config: any) => {
        if (!config || typeof config !== 'object') return config;
        const expanded = JSON.parse(JSON.stringify(config));

        if (expanded.steps && Array.isArray(expanded.steps)) {
            for (let i = 0; i < expanded.steps.length; i++) {
                let step = expanded.steps[i];
                for (const plugin of plugins) {
                    if (plugin.preprocessStep) {
                        step = plugin.preprocessStep(step);
                    }
                }
                expanded.steps[i] = step;
            }
        }
        return expanded;
    };

    // Transform function (Resolution)
    const transform = async (config: z.infer<typeof RootSchema>) => {
        const globalModelDefaults = {
            model: config.model,
            temperature: config.temperature,
            thinkingLevel: config.thinkingLevel
        };

        const resolvedSteps = await Promise.all(config.steps.map(async (step) => {
            // 1. Merge Model Config
            const rawStepModel = step.model || {};
            const mergedStepModelConfig = mergeModelConfigs(rawStepModel, {
                ...globalModelDefaults,
                system: step.system,
                prompt: step.prompt
            });
            const resolvedModel = transformModelConfig(mergedStepModelConfig);

            // 2. Resolve Plugins
            const resolvedPlugins = await Promise.all(step.plugins.map(async (rawPlugin: any) => {
                const pluginType = rawPlugin.type;
                const pluginInstance = registry.get(pluginType);

                if (!pluginInstance) {
                    throw new Error(`Unknown plugin type: '${pluginType}'`);
                }

                // Get specific schema for this plugin in this context
                const pluginSchema = pluginInstance.getSchema(step as any, config);
                
                // Parse and transform the plugin config
                const parsedConfig = await pluginSchema.parseAsync(rawPlugin);

                return {
                    type: pluginType,
                    id: (parsedConfig as any).id ?? `${pluginType}-${Date.now()}`,
                    output: (parsedConfig as any).output,
                    config: parsedConfig,
                    instance: pluginInstance
                };
            }));

            // 3. Resolve Judge & Feedback
            const resolvedJudge = step.judge ? resolveModelConfig(step.judge, mergedStepModelConfig) : undefined;

            let resolvedFeedback;
            if (step.feedback) {
                const fbConfig = resolveModelConfig(step.feedback, mergedStepModelConfig);
                resolvedFeedback = { ...fbConfig, loops: step.feedback.loops };
            }

            // 4. Construct Resolved Step
            return {
                ...config, // Inherit globals
                ...step,
                model: resolvedModel,
                judge: resolvedJudge,
                feedback: resolvedFeedback,
                plugins: resolvedPlugins
            };
        }));

        return {
            ...config,
            steps: resolvedSteps
        };
    };

    return z.preprocess(preprocess, RootSchema.transform(transform));
};

// Infer Types
const defaultSchema = createPipelineSchema();
export type BatchPromptConfig = z.input<typeof defaultSchema>;
export type RuntimeConfig = z.output<typeof defaultSchema>;
export type StepConfig = RuntimeConfig['steps'][number];

// Legacy export for compatibility if needed
export const createPipelineSchemaFactory = (registry: PluginRegistryV2) => {
    return async (config: any) => {
        const schema = createPipelineSchema(registry);
        return schema.parseAsync(config);
    };
};
