import { RuntimeConfig, StepConfig, ModelConfig } from './types.js';
import { createPipelineSchema } from './schema.js';
import { ConfigNormalizer } from './ConfigNormalizer.js';
import { PromptLoader } from './PromptLoader.js';
import { SchemaLoader } from './SchemaLoader.js';
import { PluginRegistryV2 } from '../plugins/types.js';
import { ContentResolver } from '../core/io/ContentResolver.js';
import { z } from 'zod';
import { zJsonSchemaObject } from './validationRules.js';
import { UrlExpanderConfigSchema } from '../plugins/url-expander/UrlExpanderConfig.js';

export interface ResolveConfigDependencies {
    pluginRegistry: PluginRegistryV2;
    contentResolver: ContentResolver;
    promptLoader: PromptLoader;
    schemaLoader: SchemaLoader;
}

/**
 * Single entry point for resolving raw configuration into RuntimeConfig.
 */
export async function resolveConfig(
    rawConfig: unknown,
    deps: ResolveConfigDependencies
): Promise<RuntimeConfig> {
    const normalizer = new ConfigNormalizer(
        deps.schemaLoader,
        deps.contentResolver,
        deps.pluginRegistry,
        deps.promptLoader
    );

    // 0. Get Dynamic Plugin Schema
    const pluginUnion = deps.pluginRegistry.getSchema();

    // 1. Parse with Loose Schema (allows strings for schemas/prompts)
    const LoosePipelineConfigSchema = createPipelineSchema(
        pluginUnion,
        z.union([z.string(), zJsonSchemaObject])
    );
    
    const looseConfig = LoosePipelineConfigSchema.parse(rawConfig);

    // 2. Normalize (Resolve file paths to objects)
    const normalizedConfig = await normalizer.normalize(looseConfig);

    // 3. Expand shortcuts (inject implicit plugins, remove shortcut keys)
    const expandedConfig = expandShortcuts(normalizedConfig, deps.pluginRegistry);

    // 4. Validate with Strict Schema - this applies all Zod defaults
    const PipelineConfigSchema = createPipelineSchema(
        pluginUnion,
        zJsonSchemaObject
    );
    
    const config = PipelineConfigSchema.parse(expandedConfig);

    // 5. Resolve steps (merge globals, transform plugins)
    const resolvedSteps: StepConfig[] = [];

    for (let i = 0; i < config.steps.length; i++) {
        const step = config.steps[i];
        const resolved = resolveStep(step, config, i);
        resolvedSteps.push(resolved);
    }

    return {
        ...config,
        steps: resolvedSteps
    };
}

/**
 * Expands step-level shortcuts into explicit plugin configurations.
 */
function expandShortcuts(config: any, registry: PluginRegistryV2): any {
    const expanded = JSON.parse(JSON.stringify(config));

    if (expanded.steps) {
        for (const step of expanded.steps) {
            step.plugins = step.plugins || [];
            
            // Special handling for UrlExpander shortcut 'expandUrls'
            // Since we removed mapStepToConfig from the generic interface, we handle known shortcuts here.
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

/**
 * Resolves a single step, merging with globals and transforming plugins.
 */
function resolveStep(step: any, globals: any, stepIndex: number): StepConfig {
    const stepModel = step.model ?? {};

    // Merge model: Step overrides Global
    const mergedModel: ModelConfig = {
        model: stepModel.model ?? globals.model,
        temperature: stepModel.temperature ?? globals.temperature ?? 0.7,
        thinkingLevel: stepModel.thinkingLevel ?? globals.thinkingLevel,
        system: stepModel.system ?? step.system,
        prompt: stepModel.prompt ?? step.prompt
    };

    // Clone output and propagate global limits if exploding
    const output = { ...step.output };
    if (output.explode) {
        output.limit ??= globals.limit;
        output.offset ??= globals.offset;
    }

    // Transform plugins to resolved format
    const plugins = (step.plugins || []).map((p: any, idx: number) => {
        const pluginOutput = p.output ? { ...p.output } : { mode: 'ignore', explode: false };
        
        if (pluginOutput.explode) {
            pluginOutput.limit ??= globals.limit;
            pluginOutput.offset ??= globals.offset;
        }

        // We merge the global model settings into the plugin config here
        // so that the plugin.init() receives the fully merged config.
        const rawConfig = p.rawConfig || p;
        const mergedConfig = { ...rawConfig };
        
        // Heuristic: If the plugin config has model fields, apply defaults
        // This is a bit loose, but plugins will validate/refine in init()
        for (const key of Object.keys(mergedConfig)) {
            if (key.endsWith('Model') && typeof mergedConfig[key] === 'object') {
                mergedConfig[key] = {
                    model: mergedConfig[key].model ?? mergedModel.model,
                    temperature: mergedConfig[key].temperature ?? mergedModel.temperature,
                    thinkingLevel: mergedConfig[key].thinkingLevel ?? mergedModel.thinkingLevel,
                    ...mergedConfig[key]
                };
            }
        }

        return {
            type: p.type as string,
            id: p.id ?? `${p.type}-${stepIndex}-${idx}`,
            output: pluginOutput,
            rawConfig: mergedConfig
        };
    });

    // Resolve judge (inherit model settings)
    let judge: ModelConfig | undefined;
    if (step.judge?.prompt) {
        judge = {
            ...step.judge,
            model: step.judge.model ?? mergedModel.model,
            temperature: step.judge.temperature ?? mergedModel.temperature,
            thinkingLevel: step.judge.thinkingLevel ?? mergedModel.thinkingLevel
        };
    }

    // Resolve feedback (inherit model settings)
    let feedback: (ModelConfig & { loops: number }) | undefined;
    if (step.feedback?.prompt || step.feedback?.loops) {
        feedback = {
            ...step.feedback,
            model: step.feedback?.model ?? mergedModel.model,
            temperature: step.feedback?.temperature ?? mergedModel.temperature,
            thinkingLevel: step.feedback?.thinkingLevel ?? mergedModel.thinkingLevel,
            loops: step.feedback?.loops ?? 0
        };
    }

    const outputPathTemplate = step.outputPath ?? globals.outputPath;

    // Resolve timeout with global fallback and final default
    const timeout = step.timeout ?? globals.timeout ?? 180;

    return {
        model: mergedModel,
        plugins,
        output,
        outputPath: outputPathTemplate,
        outputTemplate: outputPathTemplate,
        schema: step.schema,
        candidates: step.candidates, // Default already applied by Zod
        judge,
        feedback,
        feedbackLoops: feedback?.loops ?? 0,
        aspectRatio: step.aspectRatio,
        command: step.command,
        verifyCommand: step.verifyCommand,
        skipCandidateCommand: step.skipCandidateCommand,
        tmpDir: globals.tmpDir,
        timeout,
        expandUrls: step.expandUrls ?? true
    };
}
