import { z } from 'zod';
import Handlebars from 'handlebars';
import {
    Plugin,
    PluginExecutionContext,
    PluginResult,
    PluginPacket
} from '../types.js';
import { ServiceCapabilities, ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, PromptDefSchema } from '../../config/common.js';
import { PromptLoader } from '../../config/PromptLoader.js';
import { AiWebSearch } from '../../utils/AiWebSearch.js';
import { LlmListSelector } from '../../utils/LlmListSelector.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';

// =============================================================================
// Raw Config Schema (Single source of truth for defaults)
// =============================================================================

export const WebSearchConfigSchemaV2 = z.object({
    type: z.literal('web-search').describe("Identifies this as a Web Search plugin."),
    id: z.string().optional().describe("Unique ID for this plugin instance."),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }).describe("How to save the search results."),
    query: z.string().optional().describe("The search query. Supports Handlebars (e.g., '{{keyword}}')."),

    // Query model config
    queryModel: z.string().optional().describe("Model used to generate search queries."),
    queryTemperature: z.number().min(0).max(2).optional().describe("Temperature for query generation."),
    queryThinkingLevel: z.enum(['low', 'medium', 'high']).optional().describe("Thinking level for query generation."),
    queryPrompt: PromptDefSchema.optional().describe("Instructions for generating search queries."),
    querySystem: PromptDefSchema.optional().describe("System prompt for query generation."),

    // Select model config
    selectModel: z.string().optional().describe("Model used to select/filter results."),
    selectTemperature: z.number().min(0).max(2).optional().describe("Temperature for selection."),
    selectThinkingLevel: z.enum(['low', 'medium', 'high']).optional().describe("Thinking level for selection."),
    selectPrompt: PromptDefSchema.optional().describe("Criteria for selecting results."),
    selectSystem: PromptDefSchema.optional().describe("System prompt for selection."),

    // Compress model config
    compressModel: z.string().optional().describe("Model used to summarize page content."),
    compressTemperature: z.number().min(0).max(2).optional().describe("Temperature for compression."),
    compressThinkingLevel: z.enum(['low', 'medium', 'high']).optional().describe("Thinking level for compression."),
    compressPrompt: PromptDefSchema.optional().describe("Instructions for summarizing content."),
    compressSystem: PromptDefSchema.optional().describe("System prompt for compression."),

    // Search options
    limit: z.number().int().positive().default(5).describe("Max total results to return."),
    mode: z.enum(['none', 'markdown', 'html']).default('none').describe("Content fetching mode: 'none' (snippets only), 'markdown', 'html'."),
    queryCount: z.number().int().positive().default(3).describe("Number of queries to generate (if using query model)."),
    maxPages: z.number().int().positive().default(1).describe("Max pages of search results to fetch per query."),
    dedupeStrategy: z.enum(['none', 'domain', 'url']).default('none').describe("Deduplication strategy."),
    gl: z.string().optional().describe("Google Search country code (e.g. 'de', 'us')."),
    hl: z.string().optional().describe("Google Search language code (e.g. 'de', 'en').")
}).describe("Configuration for the Web Search plugin.");

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

    constructor(private promptLoader: PromptLoader) {}

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return ['hasSerper'];
    }

    async resolveConfig(
        rawConfig: WebSearchRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' },
        contentResolver: ContentResolver
    ): Promise<WebSearchResolvedConfigV2> {
        
        const resolvePrompt = async (
            prompt: any,
            modelOverride?: string,
            temperatureOverride?: number,
            thinkingLevelOverride?: 'low' | 'medium' | 'high'
        ): Promise<ResolvedModelConfig | undefined> => {
            if (!prompt) return undefined;
            const parts = await this.promptLoader.load(prompt);
            // Render Handlebars in text parts
            const renderedParts = parts.map((part: any) => {
                if (part.type === 'text') {
                    const template = Handlebars.compile(part.text, { noEscape: true });
                    return { type: 'text' as const, text: template(row) };
                }
                return part;
            });
            return {
                model: modelOverride || inheritedModel.model,
                temperature: temperatureOverride ?? inheritedModel.temperature,
                thinkingLevel: thinkingLevelOverride ?? inheritedModel.thinkingLevel,
                systemParts: [],
                promptParts: renderedParts
            };
        };

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
            queryModel: await resolvePrompt(
                rawConfig.queryPrompt,
                rawConfig.queryModel,
                rawConfig.queryTemperature,
                rawConfig.queryThinkingLevel
            ),
            selectModel: await resolvePrompt(
                rawConfig.selectPrompt,
                rawConfig.selectModel,
                rawConfig.selectTemperature,
                rawConfig.selectThinkingLevel
            ),
            compressModel: await resolvePrompt(
                rawConfig.compressPrompt,
                rawConfig.compressModel,
                rawConfig.compressTemperature,
                rawConfig.compressThinkingLevel
            ),
            limit: rawConfig.limit,
            mode: rawConfig.mode,
            queryCount: rawConfig.queryCount,
            maxPages: rawConfig.maxPages,
            dedupeStrategy: rawConfig.dedupeStrategy,
            gl: rawConfig.gl,
            hl: rawConfig.hl
        };
    }

    async execute(
        config: WebSearchResolvedConfigV2,
        context: PluginExecutionContext
    ): Promise<PluginResult> {
        const { services, row, emit } = context;
        const webSearch = services.webSearch;

        if (!webSearch) {
            throw new Error('[WebSearch] WebSearch service not available');
        }

        // Create LLM clients
        const queryLlm = config.queryModel ? services.createLlm(config.queryModel) : undefined;
        const selectLlm = config.selectModel ? services.createLlm(config.selectModel) : undefined;
        const compressLlm = config.compressModel ? services.createLlm(config.compressModel) : undefined;

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

        // Convert results into individual packets.
        const packets: PluginPacket[] = result.data.map(item => {
            const text = `Source: ${item.title} (${item.link})\nContent:\n${item.content}`;
            return {
                data: item,
                contentParts: [{ type: 'text', text }]
            };
        });

        if (packets.length === 0) {
            return {
                packets: [{
                    data: {},
                    contentParts: result.contentParts
                }]
            };
        }

        return { packets };
    }
}
