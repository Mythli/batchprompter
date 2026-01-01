import OpenAI from 'openai';
import {
    ResolvedPipelineConfig,
    ResolvedStepConfig,
    ResolvedModelConfig,
    ServiceCapabilities
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
}

export class ConfigResolver {
    private promptLoader: PromptLoader;
    private schemaLoader: SchemaLoader;
    private normalizer: ConfigNormalizer;

    constructor(private deps: ConfigResolverDependencies) {
        this.promptLoader = new PromptLoader(deps.contentResolver);
        this.schemaLoader = new SchemaLoader(deps.contentResolver);
        this.normalizer = new ConfigNormalizer(deps.contentResolver);
    }

    /**
     * Validate and resolve a raw pipeline configuration
     */
    async resolve(rawConfig: unknown): Promise<ResolvedPipelineConfig> {
        // 1. Parse with Loose Schema (allows strings for schemas)
        // This applies defaults and basic structure validation
        const looseConfig = LoosePipelineConfigSchema.parse(rawConfig);

        // 2. Normalize (Resolve file paths to objects)
        const normalizedConfig = await this.normalizer.normalize(looseConfig);

        // 3. Validate with Strict Schema (enforces objects and valid schemas)
        const config = PipelineConfigSchema.parse(normalizedConfig);

        // 4. Validate plugin capabilities
        this.deps.pluginRegistry.validateCapabilities(config.steps, this.deps.capabilities);

        // 5. Load data (from stdin)
        const allRows = await loadData();
        const offset = config.data.offset ?? 0;
        const limit = config.data.limit;
        const rows = limit ? allRows.slice(offset, offset + limit) : allRows.slice(offset);

        // 6. Resolve steps (without row context - templates remain)
        const resolvedSteps: ResolvedStepConfig[] = [];

        for (let i = 0; i < config.steps.length; i++) {
            const step = config.steps[i];
            const resolved = await this.resolveStep(step, config.globals, i);
            resolvedSteps.push(resolved);
        }

        return {
            data: {
                rows,
                offset,
                limit
            },
            globals: config.globals,
            steps: resolvedSteps
        };
    }

    private async resolveStep(
        step: any, // Using any because Strict schema types are inferred and might be complex
        globals: any,
        stepIndex: number
    ): Promise<ResolvedStepConfig> {
        const stepModelConfig = step.model ?? {};
        
        // Merge model settings: Step > Global
        const mergedModel = {
            model: stepModelConfig.model ?? globals.model,
            temperature: stepModelConfig.temperature ?? globals.temperature,
            thinkingLevel: stepModelConfig.thinkingLevel ?? globals.thinkingLevel
        };

        // Resolve prompts (templates remain unrendered)
        const prompt = await this.resolvePrompt(step.prompt);
        const system = await this.resolvePrompt(step.system);

        // Plugins are resolved per-row during execution
        // Here we just store the raw config (which is now Normalized/Strict)
        const plugins = step.plugins.map((p: any, idx: number) => ({
            type: p.type as string,
            id: (p as any).id ?? `${p.type}-${stepIndex}-${idx}`,
            output: p.output,
            rawConfig: p
        }));

        // Resolve judge
        let judge: ResolvedModelConfig | undefined;
        if (step.judge?.prompt) {
            judge = await this.resolveModelConfig(step.judge, mergedModel);
        }

        // Resolve feedback
        let feedback: (ResolvedModelConfig & { loops: number }) | undefined;
        if (step.feedback?.prompt || step.feedback?.loops) {
            const feedbackModel = await this.resolveModelConfig(step.feedback || {}, mergedModel);
            feedback = {
                ...feedbackModel,
                loops: step.feedback?.loops ?? 0
            };
        }

        return {
            prompt: { parts: prompt },
            system: { parts: system },
            model: mergedModel.model,
            temperature: mergedModel.temperature,
            thinkingLevel: mergedModel.thinkingLevel,
            plugins,
            output: step.output,
            outputTemplate: step.outputPath ?? globals.outputPath,
            schema: step.schema, // Already normalized to object
            candidates: step.candidates,
            skipCandidateCommand: step.skipCandidateCommand,
            judge,
            feedback,
            aspectRatio: step.aspectRatio,
            command: step.command,
            verifyCommand: step.verifyCommand,
            tmpDir: globals.tmpDir,
            timeout: step.timeout ?? globals.timeout
        };
    }

    private async resolvePrompt(
        prompt?: string | { file?: string; text?: string; parts?: any[] }
    ): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        if (!prompt) return [];
        return this.promptLoader.load(prompt);
    }

    private async resolveModelConfig(
        config: { model?: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high'; prompt?: any; system?: any },
        inherited: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
    ): Promise<ResolvedModelConfig> {
        const merged = {
            model: config.model ?? inherited.model,
            temperature: config.temperature ?? inherited.temperature,
            thinkingLevel: config.thinkingLevel ?? inherited.thinkingLevel
        };

        return {
            model: merged.model,
            temperature: merged.temperature,
            thinkingLevel: merged.thinkingLevel,
            systemParts: await this.resolvePrompt(config.system),
            promptParts: await this.resolvePrompt(config.prompt)
        };
    }
}
