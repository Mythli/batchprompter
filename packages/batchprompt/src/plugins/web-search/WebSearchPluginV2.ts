import { z } from 'zod';
import Handlebars from 'handlebars';
import {
    Plugin,
    LlmFactory,
    PluginPacket
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, RawModelConfigSchema, DEFAULT_PLUGIN_OUTPUT, transformModelConfig } from '../../config/schemas/index.js';
import { AiWebSearch } from './AiWebSearch.js';
import { LlmListSelector } from '../../utils/LlmListSelector.js';
import { WebSearch } from './WebSearch.js';
import { StepBaseConfig, GlobalsConfig } from '../../config/schema.js';

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

export type WebSearchRawConfigV2 = z.infer<typeof WebSearchConfigSchemaV2>;

export interface WebSearchResolvedConfigV2 {
    type: 'web-search';
    id: string;
    output: ResolvedOutputConfig;
    query?: string;
    queryModel?: ResolvedModelConfig;
    selectModel?: ResolvedModelConfig;
    compressModel?: ResolvedModelConfig;
    limit: number;
    mode: 'none' | 'markdown' | 'html';
    queryCount: number;
    maxPages: number;
    dedupeStrategy: 'none' | 'domain' | 'url';
    gl?: string;
    hl?: string;
}

export interface WebSearchHydratedConfigV2 extends Omit<WebSearchResolvedConfigV2, 'query'> {
    query?: string;
}

export class WebSearchPluginV2 implements Plugin<WebSearchRawConfigV2, WebSearchResolvedConfigV2, WebSearchHydratedConfigV2> {
    readonly type = 'web-search';
    readonly configSchema = WebSearchConfigSchemaV2;

    constructor(
        private deps: {
            webSearch: WebSearch;
            createLlm: LlmFactory;
        }
    ) {}

    getSchema(step: StepBaseConfig, globals: GlobalsConfig) {
        return WebSearchConfigSchemaV2.transform(config => {
            const stepModel = step.model || {};
            
            const resolveModel = (modelConfig?: any) => {
                const merged = {
                    model: modelConfig?.model ?? stepModel.model,
                    temperature: modelConfig?.temperature ?? stepModel.temperature,
                    thinkingLevel: modelConfig?.thinkingLevel ?? stepModel.thinkingLevel,
                    system: modelConfig?.system,
                    prompt: modelConfig?.prompt
                };
                return transformModelConfig(merged);
            };

            return {
                type: 'web-search' as const,
                id: config.id ?? `web-search-${Date.now()}`,
                output: config.output,
                query: config.query,
                queryModel: config.queryModel ? resolveModel(config.queryModel) : undefined,
                selectModel: config.selectModel ? resolveModel(config.selectModel) : undefined,
                compressModel: config.compressModel ? resolveModel(config.compressModel) : undefined,
                limit: config.limit,
                mode: config.mode,
                queryCount: config.queryCount,
                maxPages: config.maxPages,
                dedupeStrategy: config.dedupeStrategy,
                gl: config.gl,
                hl: config.hl
            };
        });
    }

    async hydrate(config: WebSearchResolvedConfigV2, context: Record<string, any>): Promise<WebSearchHydratedConfigV2> {
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

    async prepare(stepRow: StepRow, config: WebSearchHydratedConfigV2): Promise<PluginPacket[]> {
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

        // Return packet
        return [{
            data: result.data, // Array of results
            contentParts: result.contentParts
        }];
    }

    async postProcess(stepRow: StepRow, config: WebSearchHydratedConfigV2, modelResult: any): Promise<PluginPacket[]> {
        // Pass-through
        return [{
            data: [modelResult],
            contentParts: []
        }];
    }
}
