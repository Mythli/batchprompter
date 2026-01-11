import { z } from 'zod';
import Handlebars from 'handlebars';
import {
    BasePlugin,
    LlmFactory,
    PluginPacket
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { OutputConfigSchema, RawModelConfigSchema, DEFAULT_PLUGIN_OUTPUT, resolveModelConfig, StepBaseConfig, GlobalsConfig } from '../../config/index.js';
import { AiWebSearch } from './AiWebSearch.js';
import { LlmListSelector } from '../../utils/LlmListSelector.js';
import { WebSearch } from './WebSearch.js';

export const WebSearchConfigSchemaV2 = z.object({
    type: z.literal('web-search'),
    id: z.string().optional(),
    output: OutputConfigSchema.default(DEFAULT_PLUGIN_OUTPUT),
    query: z.string().optional(),
    queryModel: RawModelConfigSchema.optional(),
    selectModel: RawModelConfigSchema.optional(),
    compressModel: RawModelConfigSchema.optional(),
    limit: z.number().int().positive().default(5),
    mode: z.enum(['none', 'markdown', 'html']).default('none'),
    queryCount: z.number().int().positive().default(3),
    maxPages: z.number().int().positive().default(1),
    dedupeStrategy: z.enum(['none', 'domain', 'url']).default('none'),
    gl: z.string().optional(),
    hl: z.string().optional()
}).strict();

export type WebSearchConfig = z.output<typeof WebSearchConfigSchemaV2>;

export class WebSearchPluginV2 extends BasePlugin<WebSearchConfig> {
    readonly type = 'web-search';

    constructor(
        private deps: {
            webSearch: WebSearch;
            createLlm: LlmFactory;
        }
    ) {
        super();
    }

    getSchema() {
        return WebSearchConfigSchemaV2.transform(config => {
            return {
                ...config,
                id: config.id ?? `web-search-${Date.now()}`,
                queryModel: config.queryModel ? resolveModelConfig(config.queryModel, step.model) : undefined,
                selectModel: config.selectModel ? resolveModelConfig(config.selectModel, step.model) : undefined,
                compressModel: config.compressModel ? resolveModelConfig(config.compressModel, step.model) : undefined,
            };
        });
    }

    async hydrate(config: WebSearchConfig, context: Record<string, any>): Promise<WebSearchConfig> {
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
        const emit = stepRow.step.globalContext.events.emit.bind(stepRow.step.globalContext.events);
        const webSearch = this.deps.webSearch;

        const queryLlm = config.queryModel ? stepRow.createLlm(config.queryModel) : undefined;
        const selectLlm = config.selectModel ? stepRow.createLlm(config.selectModel) : undefined;
        const compressLlm = config.compressModel ? stepRow.createLlm(config.compressModel) : undefined;

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
