import { z } from 'zod';
import Handlebars from 'handlebars';
import {
    BasePlugin,
    BasePluginRow
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { OutputConfigSchema, StepConfig } from '../../config/schema.js';
import { ModelConfigSchema, ModelConfig } from '../../config/model.js';
import { WebSearch } from './WebSearch.js';
import { WebSearchPluginRow } from './WebSearchPluginRow.js';

export const WebSearchConfigSchemaV2 = z.object({
    type: z.literal('web-search'),
    id: z.string().optional(),
    output: OutputConfigSchema,
    query: z.string().optional(),
    queryModel: ModelConfigSchema.optional(),
    selectModel: ModelConfigSchema.optional(),
    compressModel: ModelConfigSchema.optional(),
    limit: z.number().int().positive().default(5),
    mode: z.enum(['none', 'markdown', 'html']).default('none'),
    queryCount: z.number().int().positive().default(3),
    maxPages: z.number().int().positive().default(1),
    dedupeStrategy: z.enum(['none', 'domain', 'url']).default('none'),
    gl: z.string().optional(),
    hl: z.string().optional()
}).strict();

export type WebSearchConfig = z.output<typeof WebSearchConfigSchemaV2>;

export class WebSearchPluginV2 extends BasePlugin<WebSearchConfig, WebSearchConfig> {
    readonly type = 'web-search';

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

    normalizeConfig(config: WebSearchConfig, stepConfig: StepConfig): WebSearchConfig {
        const base = super.normalizeConfig(config, stepConfig);

        return {
            ...base,
            id: config.id ?? `web-search-${Date.now()}`,
            queryModel: this.mergeModels(stepConfig.model, config.queryModel),
            selectModel: this.mergeModels(stepConfig.model, config.selectModel),
            compressModel: this.mergeModels(stepConfig.model, config.compressModel),
        };
    }

    private mergeModels(base?: ModelConfig, override?: ModelConfig): ModelConfig | undefined {
        if (!base && !override) return undefined;
        if (!override) return base;
        if (!base) return override;
        return {
            ...base,
            ...override,
            messages: override.messages.length > 0 ? override.messages : base.messages
        };
    }

    async hydrate(stepConfig: StepConfig, config: WebSearchConfig, context: Record<string, any>): Promise<WebSearchConfig> {
        let query: string | undefined;
        if (config.query) {
            const template = Handlebars.compile(config.query, { noEscape: true });
            query = template(context);
        }

        return {
            ...config,
            query
        };
    }

    createRow(stepRow: StepRow, config: WebSearchConfig): BasePluginRow<WebSearchConfig> {
        return new WebSearchPluginRow(stepRow, config, this.deps.webSearch);
    }
}
