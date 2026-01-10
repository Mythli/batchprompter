import { z } from 'zod';
import os from 'os';
import path from 'path';
import {zHandlebars, zJsonSchemaObject} from './validationRules.js';
import { PluginRegistryV2 } from '../plugins/types.js';

// we take env, we take model defaults from env
// this allows us to build a full model schema with defaults which come from env, this means this needs to be in the container already, it cant infer types? --> no it can, they are mandatory
// we take global stuff, merge it into the step
//
// we as

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

export const PromptSchema = z.union([
    z.string(),
    z.array(z.any()) // ContentPart[]
]).describe("Prompt definition: string or ContentPart[]");

export type PromptDef = z.infer<typeof PromptSchema>;

export function transformModelConfig(config: z.infer<typeof RawModelConfigSchema>) {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    if (config.system) {
        const parts = normalizePromptToParts(config.system);
        const text = parts.map(p => p.type === 'text' ? p.text : '').join('\n');
        if (text) {
            messages.push({ role: 'system', content: text });
        }
    }

    if (config.prompt) {
        const parts = normalizePromptToParts(config.prompt);
        if (parts.length > 0) {
            messages.push({ role: 'user', content: parts });
        }
    }

    return {
        model: config.model,
        temperature: config.temperature,
        thinkingLevel: config.thinkingLevel,
        messages
    };
}

const ModelConfigSchema = z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    system: PromptSchema.optional(),
    prompt: PromptSchema.optional()
});


const createModelConfigSchemaWithDefaults = () => {

}

export const FeedbackConfigSchema = ModelConfigSchema.extend({
    loops: z.number().int().min(0).default(0).describe("Number of feedback iterations to run.")
});

export const StepSchema = z.object({
    timeout: z.number().int().positive().default(180),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().min(0).optional(),
    // ?
    data: z.array(z.record(z.string(), z.any())).default([{}]),
    model: ModelConfigSchema.optional(),
    candidates: z.number().int().positive().default(1),
    judge: ModelConfigSchema.optional(),
    feedback: FeedbackConfigSchema.optional(),
    aspectRatio: z.string().optional(),
    schema: zJsonSchemaObject.optional(),
    output: OutputConfigSchema,
    plugins: z.array(z.any()).default([])
});

export type StepConfig = z.infer<typeof StepSchema>;

export const GlobalsSchema = StepSchema.extend({
    concurrency: z.number().int().positive().default(50),
    taskConcurrency: z.number().int().positive().default(100),
    inputLimit: z.number().int().positive().optional(),
    inputOffset: z.number().int().min(0).optional(),
    steps: z.array(StepSchema)
});

export type GlobalConfig = z.infer<typeof StepSchema>;

export const createPipelineSchemaFactory = (pluginRegistry: PluginRegistryV2) => {
    const plugins = pluginRegistry.getAll();

    return () => {
        const extendStepSchema = () => {
            let lastSchema: z.ZodObject = StepSchema;

            for (const plugin of plugins) {
                if (plugin.getStepExtensionSchema) {
                    const extension = plugin.getStepExtensionSchema();
                    if (extension) {
                        lastSchema = lastSchema.extend(extension);
                    }
                }
            }

        }
    }
}
