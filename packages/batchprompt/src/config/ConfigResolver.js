import { LoosePipelineConfigSchema, PipelineConfigSchema } from './schema.js';
import { PromptLoader } from './PromptLoader.js';
import { SchemaLoader } from './SchemaLoader.js';
import { loadData } from '../../utils/dataLoader.js';
import { ConfigNormalizer } from './ConfigNormalizer.js';
export class ConfigResolver {
    deps;
    promptLoader;
    schemaLoader;
    normalizer;
    constructor(deps) {
        this.deps = deps;
        this.promptLoader = new PromptLoader(deps.contentResolver);
        this.schemaLoader = new SchemaLoader(deps.contentResolver);
        this.normalizer = new ConfigNormalizer(deps.contentResolver, deps.pluginRegistry);
    }
    /**
     * Validate and resolve a raw pipeline configuration
     */
    async resolve(rawConfig) {
        // 1. Load Data (from stdin)
        const pipedData = await loadData();
        // 2. Merge Data
        const configToParse = typeof rawConfig === 'object' && rawConfig !== null ? { ...rawConfig } : {};
        if (!configToParse.data)
            configToParse.data = {};
        if (pipedData)
            configToParse.data.rows = pipedData;
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
        const allRows = config.data.rows;
        // Priority: globals.inputLimit > globals.limit > data.limit
        const effectiveInputLimit = config.globals.inputLimit ?? config.globals.limit ?? config.data.limit;
        const effectiveInputOffset = config.globals.inputOffset ?? config.data.offset ?? 0;
        const rows = effectiveInputLimit
            ? allRows.slice(effectiveInputOffset, effectiveInputOffset + effectiveInputLimit)
            : allRows.slice(effectiveInputOffset);
        // 8. Resolve steps (without row context - templates remain)
        const resolvedSteps = [];
        for (let i = 0; i < config.steps.length; i++) {
            const step = config.steps[i];
            const resolved = await this.resolveStep(step, config.globals, i);
            resolvedSteps.push(resolved);
        }
        return {
            data: {
                rows,
                offset: effectiveInputOffset,
                limit: effectiveInputLimit
            },
            globals: config.globals,
            steps: resolvedSteps
        };
    }
    async resolveStep(step, // Using any because Strict schema types are inferred and might be complex
    globals, stepIndex) {
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
        // Plugins are resolved per-row during execution
        // Here we just store the raw config (which is now Normalized/Strict)
        // AND inject global limits if needed
        const plugins = step.plugins.map((p, idx) => {
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
                type: p.type,
                id: p.id ?? `${p.type}-${stepIndex}-${idx}`,
                output: p.output,
                rawConfig: p
            };
        });
        // Resolve judge
        let judge;
        if (step.judge?.prompt) {
            judge = await this.resolveModelConfig(step.judge, mergedModel);
        }
        // Resolve feedback
        let feedback;
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
    async resolvePrompt(prompt) {
        if (!prompt)
            return [];
        return this.promptLoader.load(prompt);
    }
    async resolveModelConfig(config, inherited) {
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
//# sourceMappingURL=ConfigResolver.js.map