import { RuntimeConfig, StepConfig, ModelConfig } from './types.js';
import { LoosePipelineConfigSchema, PipelineConfigSchema } from './schema.js';
import { ConfigNormalizer } from './ConfigNormalizer.js';
import { PromptLoader } from './PromptLoader.js';
import { SchemaLoader } from './SchemaLoader.js';
import { PluginRegistryV2 } from '../plugins/types.js';
import { ContentResolver } from '../core/io/ContentResolver.js';
import { z } from 'zod';

export interface ResolveConfigDependencies {
    capabilities: { hasSerper: boolean; hasPuppeteer: boolean };
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

    // 1. Parse with Loose Schema (allows strings for schemas/prompts)
    const looseConfig = LoosePipelineConfigSchema.parse(rawConfig);

    // 2. Normalize (Resolve file paths to objects)
    const normalizedConfig = await normalizer.normalize(looseConfig);

    // 3. Expand shortcuts (inject implicit plugins, remove shortcut keys)
    const expandedConfig = expandShortcuts(normalizedConfig, deps.pluginRegistry);

    // 4. Validate with Strict Schema - this applies all Zod defaults
    const config = PipelineConfigSchema.parse(expandedConfig);

    // 5. Validate plugin capabilities
    deps.pluginRegistry.validateCapabilities(config.steps, deps.capabilities);

    // 6. Resolve steps (merge globals, transform plugins)
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
            
            for (const plugin of registry.getAll()) {
                if (plugin.mapStepToConfig) {
                    const pluginConfig = plugin.mapStepToConfig(step);
                    if (pluginConfig) {
                        const isExplicitlyConfigured = step.plugins.some(
                            (p: any) => p.type === pluginConfig.type
                        );
                        
                        if (!isExplicitlyConfigured) {
                            step.plugins.unshift(pluginConfig);
                        }
                        
                        // Remove shortcut keys from step
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

        return {
            type: p.type as string,
            id: p.id ?? `${p.type}-${stepIndex}-${idx}`,
            output: pluginOutput,
            rawConfig: p.rawConfig || p
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
