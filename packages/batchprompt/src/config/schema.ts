import {z} from 'zod';
import os from 'os';
import path from 'path';
import {zHandlebars, zJsonSchemaObject} from './validationRules.js';
import {PluginRegistryV2} from '../plugins/types.js';
import {ModelConfigSchema, RawModelConfigSchema, transformModelConfig} from "./model.js";

export const OutputConfigSchema = z.object({
    mode: z.enum(['merge', 'column', 'ignore']).default('ignore')
        .describe("How to handle the result: merge into row, save to column, or ignore."),
    column: z.string().optional()
        .describe("Column name when mode is 'column'."),
    explode: z.boolean().default(false)
        .describe("If true, array results create multiple rows."),
    limit: z.number().int().positive().optional()
        .describe("Max items to keep when exploding."),
    offset: z.number().int().min(0).optional()
        .describe("Starting index when exploding."),

    path: zHandlebars.optional(),
    dataPath: zHandlebars.optional(),
    tmpDir: zHandlebars.default(path.join(os.tmpdir(), 'batchprompt')),
}).describe("Configuration for output handling.");

export type OutputConfig = z.infer<typeof OutputConfigSchema>;

export const FeedbackConfigSchema = RawModelConfigSchema.extend({
    loops: z.number().int().positive().default(3)
}).transform(transformModelConfig);

export type FeedbackConfig = z.infer<typeof FeedbackConfigSchema>;

export const StepSchema = z.object({
    timeout: z.number().int().positive().default(180),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().min(0).optional(),
    data: z.array(z.record(z.string(), z.any())).default([{}]),
    model: ModelConfigSchema.optional(),
    candidates: z.number().int().positive().default(1),
    judge: ModelConfigSchema.optional(),
    feedback: FeedbackConfigSchema.optional(),
    aspectRatio: z.string().optional(),
    schema: zJsonSchemaObject.optional(),
    output: OutputConfigSchema,
    plugins: z.array(z.any()).default([])
}).loose();

export type StepConfig = z.infer<typeof StepSchema>;

export const GlobalsSchema = StepSchema.extend({
    concurrency: z.number().int().positive().default(50),
    taskConcurrency: z.number().int().positive().default(100),
    inputLimit: z.number().int().positive().optional(),
    inputOffset: z.number().int().min(0).optional(),
    steps: z.array(StepSchema)
});

export type GlobalConfig = z.infer<typeof GlobalsSchema>;

export const createPipelineSchema = (pluginRegistry: PluginRegistryV2) => {
    const plugins = pluginRegistry.getAll();

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

    return GlobalsSchema.extend({
        steps: z.array(finalStepSchema)
    });
}
