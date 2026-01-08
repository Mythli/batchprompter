import { z } from 'zod';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import {
    Plugin,
    PluginExecutionContext,
    PluginPacket,
    LlmFactory
} from '../types.js';
import { ServiceCapabilities, ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, PluginModelConfigSchema, DEFAULT_PLUGIN_OUTPUT } from '../../config/schemas/index.js';
import { PromptLoader } from '../../config/PromptLoader.js';
import { AiWebSearch } from '../../utils/AiWebSearch.js';
import { LlmListSelector } from '../../utils/LlmListSelector.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';
import { WebSearch } from './WebSearch.js';

// =============================================================================
// Raw Config Schema
// =============================================================================

export const WebSearchConfigSchemaV2 = z.object({
    type: z.literal('web-search').describe("Identifies this as a Web Search plugin."),
    id: z.string().optional().describe("Unique ID for this plugin instance."),
    output: OutputConfigSchema.default(DEFAULT_PLUGIN_OUTPUT).describe("How to save the search results."),
    
    // Query source - at least one required
    query: z.string().optional().describe("Static search query. Supports Handlebars (e.g., '{{keyword}}')."),
    queryModel: PluginModelConfigSchema.optional().describe("Model configuration for generating search queries."),
    
    // Selection/filtering
    selectModel: PluginModelConfigSchema.optional().describe("Model configuration for selecting/filtering results."),
    
    // Content compression
    compressModel: PluginModelConfigSchema.optional().describe("Model configuration for summarizing page content."),

    // Search options
    limit: z.number().int().positive().default(5).describe("Max total results to return."),
    mode: z.enum(['none', 'markdown', 'html']).default('none').describe("Content fetching mode."),
    queryCount: z.number().int().positive().default(3).describe("Number of queries to generate (if using queryModel)."),
    maxPages: z.number().int().positive().default(1).describe("Max pages of search results to fetch per query."),
    dedupeStrategy: z.enum(['none', 'domain', 'url']).default('none').describe("Deduplication strategy."),
    gl: z.string().optional().describe("Google Search country code (e.g. 'de', 'us')."),
    hl: z.string().optional().describe("Google Search language code (e.g. 'de', 'en').")
}).strict().refine(
    (data) => data.query !== undefined || data.queryModel?.prompt !== undefined,
    {
        message: "web-search requires either 'query' or 'queryModel.prompt' to know what to search for."
    }
).describe("Configuration for the Web Search plugin.");

export type WebSearchRawConfigV2 = z.infer<typeof WebSearchConfigSchemaV2>;

// =============================================================================
// Resolved Config
// =============================================================================

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

// =============================================================================
// Plugin Implementation
// =============================================================================

export class WebSearchPluginV2 implements Plugin<WebSearchRawConfigV2, WebSearchResolvedConfigV2> {
    readonly type = 'web-search';
    readonly configSchema = WebSearchConfigSchemaV2;

    constructor(
        private deps: {
            promptLoader: PromptLoader;
            webSearch?: WebSearch;
            createLlm: LlmFactory;
        }
    ) {}

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return ['hasSerper'];
    }

    private async resolvePluginModel(
        config: z.infer<typeof PluginModelConfigSchema> | undefined,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
    ): Promise<ResolvedModelConfig | undefined> {
        if (!config?.prompt) return undefined;

        const parts = await this.deps.promptLoader.load(config.prompt as any);
        const renderedParts = parts.map((part: any) => {
            if (part.type === 'text') {
                const template = Handlebars.compile(part.text, { noEscape: true });
                return { type: 'text' as const, text: template(row) };
            }
            return part;
        });

        let systemParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        if (config.system) {
            systemParts = await this.deps.promptLoader.load(config.system as any);
            systemParts = systemParts.map((part: any) => {
                if (part.type === 'text') {
                    const template = Handlebars.compile(part.text, { noEscape: true });
                    return { type: 'text' as const, text: template(row) };
                }
                return part;
            });
        }

        return {
            model: config.model || inheritedModel.model,
            temperature: config.temperature ?? inheritedModel.temperature,
            thinkingLevel: config.thinkingLevel ?? inheritedModel.thinkingLevel,
            systemParts,
            promptParts: renderedParts
        };
    }

    async resolveConfig(
        rawConfig: WebSearchRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' },
        contentResolver: ContentResolver
    ): Promise<WebSearchResolvedConfigV2> {
        
        // Render query template
        let query: string | undefined;
        if (rawConfig.query) {
            const template = Handlebars.compile(rawConfig.query, { noEscape: true });
            query = template(row);
        }

        return {
            type: 'web-search',
            id: rawConfig.id ?? `web-search-${Date.now()}`,
            output: {
                mode: rawConfig.output.mode,
                column: rawConfig.output.column,
                explode: rawConfig.output.explode
            },
            query,
            queryModel: await this.resolvePluginModel(rawConfig.queryModel, row, inheritedModel),
            selectModel: await this.resolvePluginModel(rawConfig.selectModel, row, inheritedModel),
            compressModel: await this.resolvePluginModel(rawConfig.compressModel, row, inheritedModel),
            limit: rawConfig.limit,
            mode: rawConfig.mode,
            queryCount: rawConfig.queryCount,
            maxPages: rawConfig.maxPages,
            dedupeStrategy: rawConfig.dedupeStrategy,
            gl: rawConfig.gl,
            hl: rawConfig.hl
        };
    }

    async prepareMessages(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        config: WebSearchResolvedConfigV2,
        context: PluginExecutionContext
    ): Promise<PluginPacket[]> {
        const { row, emit } = context;
        const webSearch = this.deps.webSearch;

        if (!webSearch) {
            throw new Error('[WebSearch] WebSearch service not available');
        }

        // Create LLM clients
        const queryLlm = config.queryModel ? this.deps.createLlm(config.queryModel) : undefined;
        const selectLlm = config.selectModel ? this.deps.createLlm(config.selectModel) : undefined;
        const compressLlm = config.compressModel ? this.deps.createLlm(config.compressModel) : undefined;

        // Create Selector
        const selector = selectLlm ? new LlmListSelector(selectLlm) : undefined;

        // Use AiWebSearch utility for Map-Reduce execution
        const aiWebSearch = new AiWebSearch(webSearch, queryLlm, selector, compressLlm);

        // Wire up events to context.emit
        aiWebSearch.events.on('query:generated', (data) => {
            emit('plugin:artifact', {
                row: context.row.index,
                step: context.stepIndex,
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
                row: context.row.index,
                step: context.stepIndex,
                plugin: 'web-search',
                type: 'json',
                filename: `web_search/scatter/scatter_${safeQuery}_p${data.page}_${Date.now()}.json`,
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'web-search', 'scatter']
            });
        });

        aiWebSearch.events.on('selection:reduce', (data) => {
            emit('plugin:artifact', {
                row: context.row.index,
                step: context.stepIndex,
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
                row: context.row.index,
                step: context.stepIndex,
                plugin: 'web-search',
                type: 'json',
                filename: `web_search/enrich/enrich_${safeUrl}_${Date.now()}.json`,
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'web-search', 'enrich']
            });
        });

        aiWebSearch.events.on('result:selected', (data) => {
            emit('plugin:artifact', {
                row: context.row.index,
                step: context.stepIndex,
                plugin: 'web-search',
                type: 'json',
                filename: `web_search/selected/selected_${Date.now()}.json`,
                content: JSON.stringify(data.results, null, 2),
                tags: ['final', 'web-search', 'selected']
            });
        });

        const result = await aiWebSearch.process(row, {
            query: config.query,
            limit: config.limit,
            mode: config.mode,
            queryCount: config.queryCount,
            maxPages: config.maxPages,
            dedupeStrategy: config.dedupeStrategy,
            gl: config.gl,
            hl: config.hl
        });

        // Always return one packet per result item
        // ResultProcessor handles explosion/merging based on output config
        return result.data.map(item => {
            const text = `Source: ${item.title} (${item.link})\nContent:\n${item.content || item.snippet || ''}`;
            return {
                data: item,
                contentParts: [{ type: 'text' as const, text }]
            };
        });
    }
}
