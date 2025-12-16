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
import { DEFAULT_MODEL, DEFAULT_OUTPUT, applyGlobalsDefaults, mergeModelSettings } from './defaults.js';
import { PromptLoader } from './PromptLoader.js';
import { SchemaLoader } from './SchemaLoader.js';
import { loadData } from '../utils/dataLoader.js';
import { PluginRegistry, Plugin } from '../plugins2/types.js';

export interface ConfigResolverDependencies {
    capabilities: ServiceCapabilities;
    pluginRegistry: PluginRegistry;
}

export class ConfigResolver {
    private promptLoader = new PromptLoader();
    private schemaLoader = new SchemaLoader();

    constructor(private deps: ConfigResolverDependencies) {}

    /**
     * Validate and resolve a raw pipeline configuration
     */
    async resolve(rawConfig: unknown): Promise<ResolvedPipelineConfig> {
        // 1. Validate with Zod
        const config = PipelineConfigSchema.parse(rawConfig);

        // 2. Validate plugin capabilities
        this.deps.pluginRegistry.validateCapabilities(config.steps, this.deps.capabilities);

        // 3. Load data
        const allRows = await loadData(config.data.source);
        const offset = config.data.offset ?? 0;
        const limit = config.data.limit;
        const rows = limit ? allRows.slice(offset, offset + limit) : allRows.slice(offset);

        // 4. Apply global defaults
        const globals = applyGlobalsDefaults(config.globals);

        // 5. Resolve steps (without row context - templates remain)
        const resolvedSteps: ResolvedStepConfig[] = [];

        for (let i = 0; i < config.steps.length; i++) {
            const step = config.steps[i];
            const resolved = await this.resolveStep(step, globals, i);
            resolvedSteps.push(resolved);
        }

        return {
            data: {
                rows,
                sourcePath: config.data.source,
                offset,
                limit
            },
            globals: {
                model: globals.model ?? DEFAULT_MODEL,
                temperature: globals.temperature,
                thinkingLevel: globals.thinkingLevel,
                concurrency: globals.concurrency,
                taskConcurrency: globals.taskConcurrency,
                tmpDir: globals.tmpDir,
                outputPath: globals.outputPath
            },
            steps: resolvedSteps
        };
    }

    private async resolveStep(
        step: PipelineConfig['steps'][number],
        globals: ReturnType<typeof applyGlobalsDefaults>,
        stepIndex: number
    ): Promise<ResolvedStepConfig> {
        const stepModelConfig = step.model ?? {};
        const mergedModel = mergeModelSettings(
            { model: globals.model, temperature: globals.temperature, thinkingLevel: globals.thinkingLevel },
            stepModelConfig
        );

        // Resolve prompts (templates remain unrendered)
        const prompt = await this.resolvePrompt(step.prompt);
        const system = await this.resolvePrompt(step.system);

        // Plugins are resolved per-row during execution
        // Here we just store the raw config
        const plugins = step.plugins.map((p, idx) => ({
            type: p.type as string,
            id: (p as any).id ?? `${p.type}-${stepIndex}-${idx}`,
            output: this.resolveOutput((p as any).output),
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
            output: this.resolveOutput(step.output),
            schema,
            candidates: step.candidates,
            skipCandidateCommand: step.skipCandidateCommand,
            judge,
            feedback,
            aspectRatio: step.aspectRatio,
            command: step.command,
            verifyCommand: step.verifyCommand,
            tmpDir: globals.tmpDir
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
        const merged = mergeModelSettings(inherited, config);

        return {
            model: merged.model,
            temperature: merged.temperature,
            thinkingLevel: merged.thinkingLevel,
            systemParts: await this.resolvePrompt(config.system),
            promptParts: await this.resolvePrompt(config.prompt)
        };
    }

    private resolveOutput(output?: { mode?: string; column?: string; explode?: boolean }): ResolvedOutputConfig {
        return {
            mode: (output?.mode as ResolvedOutputConfig['mode']) ?? DEFAULT_OUTPUT.mode,
            column: output?.column,
            explode: output?.explode ?? DEFAULT_OUTPUT.explode
        };
    }
}
