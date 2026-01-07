import {
    RuntimeConfig,
    ResolvedStepConfig,
    ModelConfig,
    ServiceCapabilities
} from './types.js';
import { LoosePipelineConfigSchema, PipelineConfigSchema } from './schema.js';
import { ConfigNormalizer } from './ConfigNormalizer.js';
import { PromptLoader } from './PromptLoader.js';
import { SchemaLoader } from './SchemaLoader.js';
import { PluginRegistryV2 } from '../plugins/types.js';
import { ContentResolver } from '../core/io/ContentResolver.js';
import { z } from 'zod';

export interface ResolveConfigDependencies {
    capabilities: ServiceCapabilities;
    pluginRegistry: PluginRegistryV2;
    contentResolver: ContentResolver;
    promptLoader: PromptLoader;
    schemaLoader: SchemaLoader;
}

/**
 * Single entry point for resolving raw configuration into RuntimeConfig.
 * 
 * This function:
 * 1. Parses with loose schema (allows strings for file paths)
 * 2. Normalizes (loads files, converts to objects)
 * 3. Expands shortcuts (implicit plugins)
 * 4. Parses with strict schema (validates structure)
 * 5. Propagates globals to steps/plugins
 * 6. Returns RuntimeConfig ready for ActionRunner
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

    // 4. Validate with Strict Schema
    const config = PipelineConfigSchema.parse(expandedConfig);

    // 5. Validate plugin capabilities
    deps.pluginRegistry.validateCapabilities(config.steps, deps.capabilities);

    // 6. Propagate globals and resolve steps
    const resolvedSteps: ResolvedStepConfig[] = [];

    for (let i = 0; i < config.steps.length; i++) {
        const step = config.steps[i];
        const resolved = resolveStep(step, config, i, deps.pluginRegistry);
        resolvedSteps.push(resolved);
    }

    return {
        ...config,
        steps: resolvedSteps
    };
}

/**
 * Expands step-level shortcuts into explicit plugin configurations.
 * Also removes the shortcut keys from step to pass strict validation.
 */
function expandShortcuts(config: any, registry: PluginRegistryV2): any {
    const expanded = JSON.parse(JSON.stringify(config)); // Deep clone

    if (expanded.steps) {
        for (const step of expanded.steps) {
            step.plugins = step.plugins || [];
            
            for (const plugin of registry.getAll()) {
                if (plugin.mapStepToConfig) {
                    const pluginConfig = plugin.mapStepToConfig(step);
                    if (pluginConfig) {
                        // Check if already explicitly configured
                        const isExplicitlyConfigured = step.plugins.some(
                            (p: any) => p.type === pluginConfig.type
                        );
                        
                        if (!isExplicitlyConfigured) {
                            // Add implicit plugin at the beginning
                            step.plugins.unshift(pluginConfig);
                        }
                        
                        // Remove the shortcut keys from step to pass strict validation
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
 * Resolves a single step, propagating globals and processing plugins.
 */
function resolveStep(
    step: any,
    globals: any,
    stepIndex: number,
    pluginRegistry: PluginRegistryV2
): ResolvedStepConfig {
    const stepModelConfig = step.model ?? {};

    // Merge model settings: Step > Global
    const mergedModel: ModelConfig = {
        model: stepModelConfig.model ?? globals.model,
        temperature: stepModelConfig.temperature ?? globals.temperature,
        thinkingLevel: stepModelConfig.thinkingLevel ?? globals.thinkingLevel,
        system: stepModelConfig.system ?? step.system,
        prompt: stepModelConfig.prompt ?? step.prompt
    };

    // Clone output to avoid mutating original
    const output = { ...step.output };

    // Propagate limits to step output if exploding
    if (output.explode) {
        if (output.limit === undefined && globals.limit !== undefined) {
            output.limit = globals.limit;
        }
        if (output.offset === undefined && globals.offset !== undefined) {
            output.offset = globals.offset;
        }
    }

    // Process plugins: add IDs and propagate limits
    const plugins = (step.plugins || []).map((p: any, idx: number) => {
        // Clone plugin output to avoid mutating original
        const pluginOutput = p.output ? { ...p.output } : { mode: 'ignore', explode: false };

        // Propagate limits to plugin outputs if exploding
        if (pluginOutput.explode) {
            if (pluginOutput.limit === undefined && globals.limit !== undefined) {
                pluginOutput.limit = globals.limit;
            }
            if (pluginOutput.offset === undefined && globals.offset !== undefined) {
                pluginOutput.offset = globals.offset;
            }
        }

        return {
            type: p.type as string,
            id: p.id ?? `${p.type}-${stepIndex}-${idx}`,
            output: pluginOutput,
            rawConfig: p.rawConfig || p
        };
    });

    // Resolve judge model
    let judge: ModelConfig | undefined;
    if (step.judge?.prompt) {
        judge = {
            ...step.judge,
            model: step.judge.model ?? mergedModel.model,
            temperature: step.judge.temperature ?? mergedModel.temperature,
            thinkingLevel: step.judge.thinkingLevel ?? mergedModel.thinkingLevel
        };
    }

    // Resolve feedback model
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

    // Get the output path template
    const outputPathTemplate = step.outputPath ?? globals.outputPath;

    return {
        model: mergedModel,
        plugins,
        output,
        outputPath: outputPathTemplate,
        outputTemplate: outputPathTemplate,
        schema: step.schema,
        candidates: step.candidates,
        skipCandidateCommand: step.skipCandidateCommand,
        judge,
        feedback,
        feedbackLoops: feedback?.loops,
        aspectRatio: step.aspectRatio,
        command: step.command,
        verifyCommand: step.verifyCommand,
        tmpDir: globals.tmpDir,
        timeout: step.timeout ?? globals.timeout
    };
}
