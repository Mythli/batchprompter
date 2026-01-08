import { z } from 'zod';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import {
    Plugin,
    LlmFactory
} from '../types.js';
import { Step } from '../../core/Step.js';
import { StepRow } from '../../core/StepRow.js';
import { ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, BaseModelConfigSchema, DEFAULT_PLUGIN_OUTPUT } from '../../config/schemas/index.js';
import { PromptLoader } from '../../config/PromptLoader.js';
import { AiWebSearch } from './AiWebSearch.js';
import { LlmListSelector } from '../../utils/LlmListSelector.js';
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
    queryModel: BaseModelConfigSchema.optional().describe("Model configuration for generating search queries."),

    // Selection/filtering
    selectModel: BaseModelConfigSchema.optional().describe("Model configuration for selecting/filtering results."),

    // Content compression
    compressModel: BaseModelConfigSchema.optional().describe("Model configuration for summarizing page content."),

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
            webSearch: WebSearch;
            createLlm: LlmFactory;
        }
    ) {}

    private async resolvePluginModel(
        step: Step,
        config: z.infer<typeof BaseModelConfigSchema> | undefined
    ): Promise<ResolvedModelConfig | undefined> {
        if (!config?.prompt) return undefined;

        // Load prompts statically
        const promptParts = await step.loadPrompt(config.prompt);
        const systemParts = config.system ? await step.loadPrompt(config.system) : [];

        return {
            model: config.model,
            temperature: config.temperature,
            thinkingLevel: config.thinkingLevel,
            systemParts,
            promptParts
        };
    }

    async init(step: Step, rawConfig: WebSearchRawConfigV2): Promise<WebSearchResolvedConfigV2> {
        return {
            type: 'web-search',
            id: rawConfig.id ?? `web-search-${Date.now()}`,
            output: {
                mode: rawConfig.output.mode,
                column: rawConfig.output.column,
                explode: rawConfig.output.explode
            },
            query: rawConfig.query,
            queryModel: await this.resolvePluginModel(step, rawConfig.queryModel),
            selectModel: await this.resolvePluginModel(step, rawConfig.selectModel),
            compressModel: await this.resolvePluginModel(step, rawConfig.compressModel),
            limit: rawConfig.limit,
            mode: rawConfig.mode,
            queryCount: rawConfig.queryCount,
            maxPages: rawConfig.maxPages,
            dedupeStrategy: rawConfig.dedupeStrategy,
            gl: rawConfig.gl,
            hl: rawConfig.hl
        };
    }

    async prepare(stepRow: StepRow, config: WebSearchResolvedConfigV2): Promise<void> {
        const { context } = stepRow;
        const emit = stepRow.step.globalContext.events.emit.bind(stepRow.step.globalContext.events);
        const webSearch = this.deps.webSearch;

        // Render query template
        let query: string | undefined;
        if (config.query) {
            query = stepRow.render(config.query);
        }

        // Create LLM clients
        const queryLlm = config.queryModel ? stepRow.createLlm(config.queryModel) : undefined;
        const selectLlm = config.selectModel ? stepRow.createLlm(config.selectModel) : undefined;
        const compressLlm = config.compressModel ? stepRow.createLlm(config.compressModel) : undefined;

        // Create Selector
        const selector = selectLlm ? new LlmListSelector(selectLlm) : undefined;

        // Use AiWebSearch utility for Map-Reduce execution
        const aiWebSearch = new AiWebSearch(webSearch, queryLlm, selector, compressLlm);

        // Wire up events
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
            query,
            limit: config.limit,
            mode: config.mode,
            queryCount: config.queryCount,
            maxPages: config.maxPages,
            dedupeStrategy: config.dedupeStrategy,
            gl: config.gl,
            hl: config.hl
        });

        // Append content to the prompt
        stepRow.appendContent(result.contentParts);
        
        stepRow.context._webSearch_results = result.data;
    }

    async postProcess(stepRow: StepRow, config: WebSearchResolvedConfigV2, modelResult: any): Promise<any> {
        const searchResults = stepRow.context._webSearch_results;
        if (searchResults && (modelResult === null || modelResult === undefined)) {
            return searchResults;
        }
        
        return modelResult;
    }
}
