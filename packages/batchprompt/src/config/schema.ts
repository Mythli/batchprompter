import {z} from 'zod';
import os from 'os';
import path from 'path';
import {zHandlebars, zJsonSchemaObject} from './validationRules.js';
import {PluginRegistryV2} from '../plugins/types.js';
import {ModelConfigSchema, RawModelConfigSchema, transformModelConfig, mergeModels} from "./model.js";

const DEFAULT_TMP_DIR = path.join(os.tmpdir(), 'batchprompt');

/**
 * Partial output config for plugins - all fields optional, no defaults.
 * This allows plugins to inherit step-level output config without overriding.
 */
export const PartialOutputConfigSchema = z.object({
    mode: z.enum(['merge', 'column', 'ignore']).optional()
        .describe("How to handle the result: merge into row, save to column, or ignore."),
    column: z.string().optional()
        .describe("Column name when mode is 'column'."),
    explode: z.boolean().optional()
        .describe("If true, array results create multiple rows."),
    limit: z.number().int().positive().optional()
        .describe("Max items to keep when exploding."),
    offset: z.number().int().min(0).optional()
        .describe("Starting index when exploding."),
    path: zHandlebars.optional(),
    dataPath: zHandlebars.optional(),
    tmpDir: zHandlebars.optional(),
});

export type PartialOutputConfig = z.infer<typeof PartialOutputConfigSchema>;

/**
 * Raw output config for parsing — all fields optional, zero defaults.
 * Used in StepSchema and GlobalsSchema so Zod does NOT fill in default values.
 * This preserves the ability to distinguish "user didn't set this" from "user set to X".
 */
export const RawOutputConfigSchema = z.object({
    mode: z.enum(['merge', 'column', 'ignore']).optional()
        .describe("How to handle the result: merge into row, save to column, or ignore."),
    column: z.string().optional()
        .describe("Column name when mode is 'column'."),
    explode: z.boolean().optional()
        .describe("If true, array results create multiple rows."),
    limit: z.number().int().positive().optional()
        .describe("Max items to keep when exploding."),
    offset: z.number().int().min(0).optional()
        .describe("Starting index when exploding."),
    path: zHandlebars.optional(),
    dataPath: zHandlebars.optional(),
    tmpDir: zHandlebars.optional(),
}).describe("Configuration for output handling.");

export type RawOutputConfig = z.infer<typeof RawOutputConfigSchema>;

/**
 * Fully resolved output config type — used at runtime.
 * `mode` is always defined; other fields have sensible defaults.
 */
export interface OutputConfig {
    mode: 'merge' | 'column' | 'ignore';
    column?: string;
    explode: boolean;
    limit?: number;
    offset?: number;
    path?: string;
    dataPath?: string;
    tmpDir: string;
}

/**
 * Resolves a fully populated OutputConfig from optional global and step raw configs.
 *
 * Cascade: stepOutput → globalOutput → hardcoded defaults.
 * Each field is resolved independently via `??` so partial overrides work correctly.
 */
export function resolveOutputConfig(
    globalOutput?: RawOutputConfig,
    stepOutput?: RawOutputConfig
): OutputConfig {
    return {
        mode: stepOutput?.mode ?? globalOutput?.mode ?? 'merge',
        column: stepOutput?.column ?? globalOutput?.column,
        explode: stepOutput?.explode ?? globalOutput?.explode ?? false,
        limit: stepOutput?.limit ?? globalOutput?.limit,
        offset: stepOutput?.offset ?? globalOutput?.offset,
        path: stepOutput?.path ?? globalOutput?.path,
        dataPath: stepOutput?.dataPath ?? globalOutput?.dataPath,
        tmpDir: stepOutput?.tmpDir ?? globalOutput?.tmpDir ?? DEFAULT_TMP_DIR,
    };
}

// Feedback is now just a model config (same as judge)
export const FeedbackConfigSchema = ModelConfigSchema;

export type FeedbackConfig = z.infer<typeof FeedbackConfigSchema>;

export const StepSchema = z.object({
    timeout: z.number().int().positive().default(1000),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().min(0).optional(),
    data: z.array(z.record(z.string(), z.any())).default([{}]),
    model: ModelConfigSchema.optional(),
    candidates: z.number().int().positive().default(1),
    judge: ModelConfigSchema.optional(),
    feedback: FeedbackConfigSchema.optional(),
    feedbackLoops: z.number().int().positive().default(3)
        .describe("Number of feedback loops for iterative refinement."),
    aspectRatio: z.string().optional(),
    schema: zJsonSchemaObject.optional(),
    output: RawOutputConfigSchema.optional(),
    plugins: z.array(z.any()).default([])
}).loose();

export type StepConfig = Omit<z.infer<typeof StepSchema>, 'output'> & {
    output: OutputConfig;
    [key: string]: any;
};

/**
 * Preprocess to allow `model` to be a plain string at the global level.
 * If `model` is a string, it's wrapped as `{ model: theString }`.
 */
const coerceGlobalModel = z.preprocess((val: unknown) => {
    if (val && typeof val === 'object' && 'model' in val) {
        const raw = val as Record<string, any>;
        if (typeof raw.model === 'string') {
            return { ...raw, model: { model: raw.model } };
        }
    }
    return val;
}, z.any());

export const GlobalsSchema = z.preprocess((val: unknown) => {
    // Coerce string model to object
    if (val && typeof val === 'object' && 'model' in val) {
        const raw = val as Record<string, any>;
        if (typeof raw.model === 'string') {
            return { ...raw, model: { model: raw.model } };
        }
    }
    return val;
}, StepSchema.extend({
    concurrency: z.number().int().positive().default(30),
    taskConcurrency: z.number().int().positive().default(10),
    inputLimit: z.number().int().positive().optional(),
    inputOffset: z.number().int().min(0).optional(),
    dataOutputPath: z.string().optional(),
    steps: z.array(StepSchema)
}));

export type GlobalConfig = Omit<z.infer<typeof GlobalsSchema>, 'output' | 'steps'> & {
    output: OutputConfig;
    steps: StepConfig[];
    dataOutputPath?: string;
    [key: string]: any;
};

/**
 * Merges global step defaults into individual steps.
 * Step-level configuration always takes precedence over global defaults.
 *
 * Output is resolved field-by-field: step → global → hardcoded defaults.
 */
export function normalizePipelineConfig(config: any): any {
    const {
        steps,
        concurrency,
        taskConcurrency,
        inputLimit,
        inputOffset,
        dataOutputPath,
        ...globalDefaults
    } = config;

    // Resolve the global-level output so it's always fully populated
    const resolvedGlobalOutput = resolveOutputConfig(globalDefaults.output);

    const normalizedSteps = (steps || []).map((step: any) => {
        // Resolve step output: step → global → hardcoded defaults
        const resolvedStepOutput = resolveOutputConfig(globalDefaults.output, step.output);

        return {
            ...globalDefaults,
            ...step,
            // Nested object merges using mergeModels for proper message handling
            model: mergeModels(globalDefaults.model, step.model),
            judge: mergeModels(globalDefaults.judge, step.judge),
            feedback: mergeModels(globalDefaults.feedback, step.feedback),
            // feedbackLoops inherits from global if not set on step
            feedbackLoops: step.feedbackLoops ?? globalDefaults.feedbackLoops,
            output: resolvedStepOutput,
        };
    });

    return {
        ...config,
        output: resolvedGlobalOutput,
        steps: normalizedSteps
    };
}

/**
 * Merges a resolved base OutputConfig with a partial plugin override.
 * The partial override wins for any field it defines.
 */
export function mergeOutputConfigs(base: OutputConfig, override?: PartialOutputConfig): OutputConfig {
    if (!override) return base;
    return {
        mode: override.mode ?? base.mode,
        column: override.column ?? base.column,
        explode: override.explode ?? base.explode,
        limit: override.limit ?? base.limit,
        offset: override.offset ?? base.offset,
        path: override.path ?? base.path,
        dataPath: override.dataPath ?? base.dataPath,
        tmpDir: override.tmpDir ?? base.tmpDir,
    };
}

export const createPipelineSchema = (pluginRegistry: PluginRegistryV2) => {
    const plugins = pluginRegistry.getAllInstances();

    const pluginSchemas = plugins.map(plugin => {
        const schema = plugin.getSchema();
        if (schema instanceof z.ZodObject) {
            return schema.extend({
                type: z.literal(plugin.type)
            });
        }
        return schema;
    });

    let stepSchemaWithExtensions: z.ZodObject = StepSchema;

    for (const plugin of plugins) {
        if (plugin.getStepExtensionSchema) {
            const extension = plugin.getStepExtensionSchema();
            if (extension) {
                stepSchemaWithExtensions = stepSchemaWithExtensions.extend(extension.shape);
            }
        }
    }

    const pluginUnion = pluginSchemas.length > 0
        ? (pluginSchemas.length === 1
            ? pluginSchemas[0]
            : z.union(pluginSchemas as [z.ZodType<any>, z.ZodType<any>, ...z.ZodType<any>[]]))
        : z.any();

    const finalStepSchema = stepSchemaWithExtensions.extend({
        plugins: z.array(pluginUnion).default([])
    });

    // Wrap the main schema with a preprocess step that:
    // 1. Coerces global string model to object
    // 2. Runs plugin preprocessStep() hooks
    const mainSchema = z.preprocess((val: unknown) => {
        if (val && typeof val === 'object' && 'model' in val) {
            const raw = val as Record<string, any>;
            if (typeof raw.model === 'string') {
                val = { ...raw, model: { model: raw.model } };
            }
        }
        return val;
    }, StepSchema.extend({
        concurrency: z.number().int().positive().default(20),
        taskConcurrency: z.number().int().positive().default(20),
        inputLimit: z.number().int().positive().optional(),
        inputOffset: z.number().int().min(0).optional(),
        dataOutputPath: z.string().optional(),
        steps: z.array(finalStepSchema)
    })).transform(normalizePipelineConfig);

    return z.preprocess((val: unknown) => {
        if (val && typeof val === 'object' && 'steps' in val && Array.isArray((val as any).steps)) {
            const raw = val as Record<string, any>;
            return {
                ...raw,
                steps: raw.steps.map((step: any) => {
                    let processedStep = step;
                    for (const plugin of plugins) {
                        processedStep = plugin.preprocessStep(processedStep);
                    }
                    return processedStep;
                })
            };
        }
        return val;
    }, mainSchema);
}
