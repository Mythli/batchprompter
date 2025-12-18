import OpenAI from 'openai';
import Handlebars from 'handlebars';
import {
    PipelineConfig,
    ResolvedPipelineConfig,
    ResolvedStepConfig,
    ResolvedModelConfig,
    ResolvedOutputConfig,
    ServiceCapabilities
} from './types.js';
import { PipelineConfigSchema } from './schema.js';
import { PromptLoader } from './PromptLoader.js';
import { SchemaLoader } from './SchemaLoader.js';
import { loadData } from '../utils/dataLoader.js';
import { PluginRegistryV2, Plugin } from '../plugins/types.js';

export interface ConfigResolverDependencies {
    capabilities: ServiceCapabilities;
    pluginRegistry: PluginRegistryV2;
}

export class ConfigResolver {
    private promptLoader = new PromptLoader();
    private schemaLoader = new SchemaLoader();

    constructor(private deps: ConfigResolverDependencies) {}

    /**
     * Validate and resolve a raw pipeline configuration
     */
    async resolve(rawConfig: unknown): Promise<ResolvedPipelineConfig> {
        // 1. Validate with Zod (applies defaults)
        const config = PipelineConfigSchema.parse(rawConfig);

        // 2. Validate plugin capabilities
        this.deps.pluginRegistry.validateCapabilities(config.steps, this.deps.capabilities);

        // 3. Load data (from stdin)
        const allRows = await loadData();
        const offset = config.data.offset ?? 0;
        const limit = config.data.limit;
        const rows = limit ? allRows.slice(offset, offset + limit) : allRows.slice(offset);

        // 4. Resolve steps (without row context - templates remain)
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
        step: PipelineConfig['steps'][number],
        globals: PipelineConfig['globals'],
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
        // Here we just store the raw config
        const plugins = step.plugins.map((p, idx) => ({
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

        // Resolve schema (without context - will be rendered per-row)
        let schema: any;
        if (step.schema) {
            if (typeof step.schema === 'string') {
                // Keep as path - will be loaded per-row
                schema = { _path: step.schema };
            } else {
                schema = step.schema;
            }
        }

        return {
            prompt: { parts: prompt },
            system: { parts: system },
            model: mergedModel.model,
            temperature: mergedModel.temperature,
            thinkingLevel: mergedModel.thinkingLevel,
            plugins,
            output: step.output,
            schema,
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
