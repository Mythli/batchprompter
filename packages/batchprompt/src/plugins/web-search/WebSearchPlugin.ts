import OpenAI from 'openai';
import { z } from 'zod';
import Handlebars from 'handlebars';
import {
    BasePlugin,
    BasePluginRow
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { PartialOutputConfigSchema, StepConfig, GlobalConfig } from '../../config/schema.js';
import { ModelConfigSchema, ModelConfig } from '../../config/model.js';
import { WebSearch } from './WebSearch.js';
import { WebSearchPluginRow } from './WebSearchPluginRow.js';

export const WebSearchConfigSchemaV2 = z.object({
    type: z.literal('webSearch'),
    id: z.string().optional(),
    output: PartialOutputConfigSchema.optional(),
    query: z.string().optional(),
    queryModel: ModelConfigSchema.optional(),
    selectModel: ModelConfigSchema.optional(),
    compressModel: ModelConfigSchema.optional(),
    limit: z.number().int().positive().default(5),
    chunkSize: z.number().int().positive().default(10),
    mode: z.enum(['none', 'markdown', 'html']).default('none'),
    queryCount: z.number().int().positive().default(3),
    maxPages: z.number().int().positive().default(1),
    dedupeStrategy: z.enum(['none', 'domain', 'url']).default('none'),
    gl: z.string().optional(),
    hl: z.string().optional()
}).strict();

export type WebSearchConfig = z.output<typeof WebSearchConfigSchemaV2>;

/**
 * Fills in missing model parameters (model name, temperature, reasoning_effort) from global defaults.
 * If pluginModel is undefined, returns undefined (feature disabled).
 * If pluginModel is defined but missing model name, fills from global.
 * Never inherits messages/prompts - those are operation-specific.
 */
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

/**
 * Renders Handlebars templates inside a ModelConfig's messages.
 * Mirrors the hydrateModel() logic in Step.hydrate(), but as a standalone function
 * so plugins can reuse it.
 */
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

export class WebSearchPlugin extends BasePlugin<WebSearchConfig, WebSearchConfig> {
    readonly type = 'webSearch';

    constructor(
        private deps: {
            webSearch: WebSearch;
        }
    ) {
        super();
    }

    getSchema() {
        return WebSearchConfigSchemaV2;
    }

    normalizeConfig(config: WebSearchConfig, stepConfig: StepConfig, globalConfig: GlobalConfig): WebSearchConfig {
        const base = super.normalizeConfig(config, stepConfig, globalConfig);

        // Get global model defaults (without messages/prompts)
        const globalModel = globalConfig.model;

        return {
            ...base,
            id: config.id ?? `webSearch-${Date.now()}`,
            // Fill model defaults from global config, NOT step config
            // If plugin model is undefined, feature stays disabled (undefined)
            queryModel: fillModelDefaults(config.queryModel, globalModel),
            selectModel: fillModelDefaults(config.selectModel, globalModel),
            compressModel: fillModelDefaults(config.compressModel, globalModel),
        };
    }

    async hydrate(_stepConfig: StepConfig, _globalConfig: GlobalConfig, config: WebSearchConfig, context: Record<string, any>): Promise<WebSearchConfig> {
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
            compressModel: hydrateModelMessages(config.compressModel, context),
        };
    }

    createRow(stepRow: StepRow, config: WebSearchConfig): BasePluginRow<WebSearchConfig> {
        return new WebSearchPluginRow(stepRow, config, this.deps.webSearch);
    }
}
