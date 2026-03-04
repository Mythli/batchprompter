import OpenAI from 'openai';
import { z } from 'zod';
import Handlebars from 'handlebars';
import { BasePlugin, BasePluginRow } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { PartialOutputConfigSchema, StepConfig, GlobalConfig } from '../../config/schema.js';
import { ModelConfigSchema, ModelConfig } from '../../config/model.js';
import { ImageSearch } from './ImageSearch.js';
import { ImageSearchPluginRow } from './ImageSearchPluginRow.js';

export const ImageSearchConfigSchemaV2 = z.object({
    type: z.literal('imageSearch'),
    id: z.string().optional(),
    output: PartialOutputConfigSchema.optional(),
    query: z.string().optional(),
    queryModel: ModelConfigSchema.optional(),
    selectModel: ModelConfigSchema.optional(),
    limit: z.number().int().positive().default(5),
    queryCount: z.number().int().positive().default(3),
    maxPages: z.number().int().positive().default(1),
    dedupeStrategy: z.enum(['none', 'domain', 'url']).default('none'),
    gl: z.string().optional(),
    hl: z.string().optional()
}).strict();

export type ImageSearchConfig = z.output<typeof ImageSearchConfigSchemaV2>;

function fillModelDefaults(
    pluginModel: ModelConfig | undefined,
    globalModel: ModelConfig | undefined
): ModelConfig | undefined {
    if (!pluginModel) return undefined;
    
    return {
        ...pluginModel,
        model: pluginModel.model || globalModel?.model,
        temperature: pluginModel.temperature ?? globalModel?.temperature,
        reasoning_effort: pluginModel.reasoning_effort ?? globalModel?.reasoning_effort,
    };
}

function hydrateModelMessages(
    model: ModelConfig | undefined,
    context: Record<string, any>
): ModelConfig | undefined {
    if (!model) return undefined;

    return {
        ...model,
        messages: model.messages.map(msg => {
            if (typeof msg.content === 'string') {
                const compiled = Handlebars.compile(msg.content, { noEscape: true });
                return { ...msg, content: compiled(context) };
            }
            if (Array.isArray(msg.content)) {
                const hydratedContent = msg.content.map((part: any) => {
                    if (part.type === 'text') {
                        const compiled = Handlebars.compile(part.text, { noEscape: true });
                        return { ...part, text: compiled(context) };
                    }
                    return part;
                });
                return { ...msg, content: hydratedContent };
            }
            return msg;
        }) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    };
}

export class ImageSearchPlugin extends BasePlugin<ImageSearchConfig, ImageSearchConfig> {
    readonly type = 'imageSearch';

    constructor(
        private deps: {
            imageSearch: ImageSearch;
        }
    ) {
        super();
    }

    getSchema() {
        return ImageSearchConfigSchemaV2;
    }

    normalizeConfig(config: ImageSearchConfig, stepConfig: StepConfig, globalConfig: GlobalConfig): ImageSearchConfig {
        const base = super.normalizeConfig(config, stepConfig, globalConfig);
        const globalModel = globalConfig.model;

        return {
            ...base,
            id: config.id ?? `imageSearch-${Date.now()}`,
            queryModel: fillModelDefaults(config.queryModel, globalModel),
            selectModel: fillModelDefaults(config.selectModel, globalModel),
        };
    }

    async hydrate(_stepConfig: StepConfig, _globalConfig: GlobalConfig, config: ImageSearchConfig, context: Record<string, any>): Promise<ImageSearchConfig> {
        let query: string | undefined;
        if (config.query) {
            const template = Handlebars.compile(config.query, { noEscape: true });
            query = template(context);
        }

        return {
            ...config,
            query,
            queryModel: hydrateModelMessages(config.queryModel, context),
            selectModel: hydrateModelMessages(config.selectModel, context),
        };
    }

    createRow(stepRow: StepRow, config: ImageSearchConfig): BasePluginRow<ImageSearchConfig> {
        return new ImageSearchPluginRow(stepRow, config, this.deps.imageSearch);
    }
}
