import { z } from 'zod';
import Handlebars from 'handlebars';
import {
    BasePlugin,
    PluginPacket
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { OutputConfigSchema, StepConfig } from '../../config/schema.js';
import { ModelConfigSchema, ModelConfig } from '../../config/model.js';
import { AiWebSearch } from './AiWebSearch.js';
import { LlmListSelector } from '../../utils/LlmListSelector.js';
import { WebSearch } from './WebSearch.js';

export const WebSearchConfigSchemaV2 = z.object({
    type: z.literal('web-search'),
    id: z.string().optional(),
    output: OutputConfigSchema.default({ mode: 'ignore' }),
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

    async prepare(stepRow: StepRow, config: WebSearchConfig): Promise<PluginPacket[]> {
        const { context } = stepRow;
        const emit = stepRow.step.deps.events.emit.bind(stepRow.step.deps.events);
        const webSearch = this.deps.webSearch;

        const queryLlm = config.queryModel ? await stepRow.createLlm(config.queryModel) : undefined;
        const selectLlm = config.selectModel ? await stepRow.createLlm(config.selectModel) : undefined;
        const compressLlm = config.compressModel ? await stepRow.createLlm(config.compressModel) : undefined;

        const selector = selectLlm ? new LlmListSelector(selectLlm) : undefined;

        const aiWebSearch = new AiWebSearch(webSearch, queryLlm, selector, compressLlm);

        aiWebSearch.events.on('query:generated', (data) => {
            emit('plugin:artifact', {
                row: context.index,
                step: stepRow.step.stepIndex,
                plugin: 'web-search',
                type: 'json',
                filename: `web_search/queries/queries_${Date.now()}.json`,
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'web-search', 'queries']
            });
        });

        aiWebSearch.events.on('search:result', (data) => {
            const safeQuery = data.query.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            emit('plugin:artifact', {
                row: context.index,
                step: stepRow.step.stepIndex,
                plugin: 'web-search',
                type: 'json',
                filename: `web_search/scatter/scatter_${safeQuery}_p${data.page}_${Date.now()}.json`,
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'web-search', 'scatter']
            });
        });

        aiWebSearch.events.on('selection:reduce', (data) => {
            emit('plugin:artifact', {
                row: context.index,
                step: stepRow.step.stepIndex,
                plugin: 'web-search',
                type: 'json',
                filename: `web_search/reduce/reduce_${Date.now()}.json`,
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'web-search', 'reduce']
            });
        });

        aiWebSearch.events.on('content:enrich', (data) => {
            const safeUrl = data.url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            emit('plugin:artifact', {
                row: context.index,
                step: stepRow.step.stepIndex,
                plugin: 'web-search',
                type: 'json',
                filename: `web_search/enrich/enrich_${safeUrl}_${Date.now()}.json`,
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'web-search', 'enrich']
            });
        });

        aiWebSearch.events.on('result:selected', (data) => {
            emit('plugin:artifact', {
                row: context.index,
                step: stepRow.step.stepIndex,
                plugin: 'web-search',
                type: 'json',
                filename: `web_search/selected/selected_${Date.now()}.json`,
                content: JSON.stringify(data.results, null, 2),
                tags: ['final', 'web-search', 'selected']
            });
        });

        const result = await aiWebSearch.process(context, {
            query: config.query,
            limit: config.limit,
            mode: config.mode,
            queryCount: config.queryCount,
            maxPages: config.maxPages,
            dedupeStrategy: config.dedupeStrategy,
            gl: config.gl,
            hl: config.hl
        });

        return [{
            data: result.data,
            contentParts: result.contentParts
        }];
    }
}
