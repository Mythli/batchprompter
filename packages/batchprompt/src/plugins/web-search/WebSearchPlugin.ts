import { z } from 'zod';
import Handlebars from 'handlebars';
import {
    BasePlugin,
    BasePluginRow
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { PartialOutputConfigSchema, StepConfig } from '../../config/schema.js';
import { ModelConfigSchema, ModelConfig, mergeModels } from '../../config/model.js';
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
    mode: z.enum(['none', 'markdown', 'html']).default('none'),
    queryCount: z.number().int().positive().default(3),
    maxPages: z.number().int().positive().default(1),
    dedupeStrategy: z.enum(['none', 'domain', 'url']).default('none'),
    gl: z.string().optional(),
    hl: z.string().optional()
}).strict();

export type WebSearchConfig = z.output<typeof WebSearchConfigSchemaV2>;

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

    normalizeConfig(config: WebSearchConfig, stepConfig: StepConfig): WebSearchConfig {
        const base = super.normalizeConfig(config, stepConfig);

        return {
            ...base,
            id: config.id ?? `webSearch-${Date.now()}`,
            queryModel: mergeModels(stepConfig.model, config.queryModel),
            selectModel: mergeModels(stepConfig.model, config.selectModel),
            compressModel: mergeModels(stepConfig.model, config.compressModel),
        };
    }

    async hydrate(_stepConfig: StepConfig, config: WebSearchConfig, context: Record<string, any>): Promise<WebSearchConfig> {
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
