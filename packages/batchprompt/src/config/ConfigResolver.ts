import OpenAI from 'openai';
import {
    ResolvedPipelineConfig,
    ResolvedStepConfig,
    ResolvedModelConfig,
    ServiceCapabilities,
    StepConfig,
    ModelConfig
} from './types.js';
import { LoosePipelineConfigSchema, PipelineConfigSchema } from './schema.js';
import { PromptLoader } from './PromptLoader.js';
import { SchemaLoader } from './SchemaLoader.js';
import { loadData } from '../utils/dataLoader.js';
import { PluginRegistryV2 } from '../plugins/types.js';
import { ContentResolver } from '../core/io/ContentResolver.js';
import { ConfigNormalizer } from './ConfigNormalizer.js';

export interface ConfigResolverDependencies {
    capabilities: ServiceCapabilities;
    pluginRegistry: PluginRegistryV2;
    contentResolver: ContentResolver;
    promptLoader: PromptLoader;
    schemaLoader: SchemaLoader;
}

export class ConfigResolver {
    private promptLoader: PromptLoader;
    private schemaLoader: SchemaLoader;
    private normalizer: ConfigNormalizer;

    constructor(private deps: ConfigResolverDependencies) {
        this.promptLoader = deps.promptLoader;
        this.schemaLoader = deps.schemaLoader;
        this.normalizer = new ConfigNormalizer(
            this.schemaLoader, 
            deps.contentResolver, 
            deps.pluginRegistry
        );
    }

    /**
     * Validate and resolve a raw pipeline configuration
     */
    async resolve(rawConfig: unknown): Promise<ResolvedPipelineConfig> {
        // 1. Load Data (from stdin)
        const pipedData = await loadData();

        // 2. Merge Data
        const configToParse = typeof rawConfig === 'object' && rawConfig !== null ? { ...(rawConfig as any) } : {};
        
        if (pipedData) {
            configToParse.data = pipedData;
        } else if (!configToParse.data) {
            configToParse.data = [{}];
        }

        // 3. Parse with Loose Schema (allows strings for schemas)
        // This applies defaults and basic structure validation
        const looseConfig = LoosePipelineConfigSchema.parse(configToParse);

        // 4. Normalize (Resolve file paths to objects)
        const normalizedConfig = await this.normalizer.normalize(looseConfig);

        // 5. Validate with Strict Schema (enforces objects and valid schemas)
        const config = PipelineConfigSchema.parse(normalizedConfig);

        // 6. Validate plugin capabilities
        this.deps.pluginRegistry.validateCapabilities(config.steps, this.deps.capabilities);

        // 7. Slice Data (Input Limits)
        const allRows = config.data;

        // Priority: globals.inputLimit > globals.limit
        const effectiveInputLimit = config.globals.inputLimit ?? config.globals.limit;
        // Priority: globals.inputOffset > globals.offset
        const effectiveInputOffset = config.globals.inputOffset ?? config.globals.offset ?? 0;

        // FIX: Do NOT slice here. Pass full data to ActionRunner to handle slicing.
        const rows = allRows;

        // 8. Resolve steps (without row context - templates remain)
        const resolvedSteps: ResolvedStepConfig[] = [];

        for (let i = 0; i < config.steps.length; i++) {
            const step = config.steps[i];
            const resolved = await this.resolveStep(step, config.globals, i);
            resolvedSteps.push(resolved);
        }

        return {
            data: rows,
            inputOffset: effectiveInputOffset,
            inputLimit: effectiveInputLimit,
            steps: resolvedSteps,
            concurrency: config.globals.concurrency,
            taskConcurrency: config.globals.taskConcurrency,
            tmpDir: config.globals.tmpDir,
            dataOutputPath: config.globals.dataOutputPath,
            offset: config.globals.offset,
            limit: config.globals.limit,
            // Flattened globals
            model: config.globals.model,
            temperature: config.globals.temperature,
            thinkingLevel: config.globals.thinkingLevel,
            outputPath: config.globals.outputPath,
            timeout: config.globals.timeout
        };
    }

    private async resolveStep(
        step: any, // Using any because Strict schema types are inferred and might be complex
        globals: any,
        stepIndex: number
    ): Promise<ResolvedStepConfig> {
        const stepModelConfig = step.model ?? {};

        // Merge model settings: Step > Global
        const mergedModel: ModelConfig = {
            model: stepModelConfig.model ?? globals.model,
            temperature: stepModelConfig.temperature ?? globals.temperature,
            thinkingLevel: stepModelConfig.thinkingLevel ?? globals.thinkingLevel,
            system: step.system,
            prompt: step.prompt
        };

        // Resolve Output Limits (Explode Limits)
        // Priority: step.output.limit > globals.limit
        if (step.output.explode) {
            if (step.output.limit === undefined && globals.limit !== undefined) {
                step.output.limit = globals.limit;
            }
            if (step.output.offset === undefined && globals.offset !== undefined) {
                step.output.offset = globals.offset;
            }
        }

        // Resolve Implicit Plugins
        const implicitPlugins: any[] = [];
        const allRegisteredPlugins = this.deps.pluginRegistry.getAll();

        for (const plugin of allRegisteredPlugins) {
            if (plugin.mapStepToConfig) {
                const implicitConfig = plugin.mapStepToConfig(step);
                if (implicitConfig) {
                    // Check if this plugin type is already explicitly configured in the 'plugins' array
                    const isExplicitlyConfigured = step.plugins.some((p: any) => p.type === implicitConfig.type);
                    
                    if (!isExplicitlyConfigured) {
                        implicitPlugins.push({
                            type: implicitConfig.type,
                            id: implicitConfig.id || `${implicitConfig.type}-implicit-${stepIndex}`,
                            output: implicitConfig.output || { mode: 'ignore', explode: false },
                            rawConfig: implicitConfig
                        });
                    }
                }
            }
        }

        // Merge: Implicit plugins run FIRST
        const mergedPlugins = [...implicitPlugins, ...step.plugins];

        // Plugins are resolved per-row during execution
        // Here we just store the raw config (which is now Normalized/Strict)
        // AND inject global limits if needed
        const plugins = mergedPlugins.map((p: any, idx: number) => {
            // Inject global limits into plugin output if exploding
            if (p.output.explode) {
                if (p.output.limit === undefined && globals.limit !== undefined) {
                    p.output.limit = globals.limit;
                }
                if (p.output.offset === undefined && globals.offset !== undefined) {
                    p.output.offset = globals.offset;
                }
            }

            return {
                type: p.type as string,
                id: (p as any).id ?? `${p.type}-${stepIndex}-${idx}`,
                output: p.output,
                rawConfig: p.rawConfig || p // Handle both rawConfig wrapper and direct object
            };
        });

        // Resolve judge
        let judge: ModelConfig | undefined;
        if (step.judge?.prompt) {
            judge = {
                ...step.judge,
                model: step.judge.model ?? mergedModel.model,
                temperature: step.judge.temperature ?? mergedModel.temperature,
                thinkingLevel: step.judge.thinkingLevel ?? mergedModel.thinkingLevel
            };
        }

        // Resolve feedback
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

        return {
            model: mergedModel,
            plugins,
            output: step.output,
            outputTemplate: step.outputPath ?? globals.outputPath,
            schema: step.schema, // Already normalized to object
            jsonSchema: step.schema, // Alias
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
}
