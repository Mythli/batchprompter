import { z } from 'zod';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import {
    Plugin,
    PluginExecutionContext,
    PluginResult,
    CLIOptionDefinition,
    PluginPacket
} from '../types.js';
import { ServiceCapabilities, ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, PromptDefSchema } from '../../config/schema.js';
import { PromptLoader } from '../../config/PromptLoader.js';
import { ModelFlags } from '../../cli/ModelFlags.js';
import { AiWebSearch } from '../../utils/AiWebSearch.js';
import { LlmListSelector } from '../../utils/LlmListSelector.js';

// =============================================================================
// Raw Config Schema (Single source of truth for defaults)
// =============================================================================

export const WebSearchConfigSchemaV2 = z.object({
    type: z.literal('web-search'),
    id: z.string().optional(),
    output: OutputConfigSchema.optional().default({}),
    query: z.string().optional(),
    // Query model config
    queryPrompt: PromptDefSchema.optional(),
    queryModel: z.string().optional(),
    queryTemperature: z.number().optional(),
    queryThinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    // Select model config
    selectPrompt: PromptDefSchema.optional(),
    selectModel: z.string().optional(),
    selectTemperature: z.number().optional(),
    selectThinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    // Compress model config
    compressPrompt: PromptDefSchema.optional(),
    compressModel: z.string().optional(),
    compressTemperature: z.number().optional(),
    compressThinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    // Search options
    limit: z.number().int().positive().default(5),
    mode: z.enum(['none', 'markdown', 'html']).default('none'),
    queryCount: z.number().int().positive().default(3),
    maxPages: z.number().int().positive().default(1),
    dedupeStrategy: z.enum(['none', 'domain', 'url']).default('none'),
    gl: z.string().optional(),
    hl: z.string().optional()
});

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

    private promptLoader = new PromptLoader();

    readonly cliOptions: CLIOptionDefinition[] = [
        // Query model options
        ...ModelFlags.getOptions('web-query', { includePrompt: true }),
        // Select model options
        ...ModelFlags.getOptions('web-select', { includePrompt: true }),
        // Compress model options
        ...ModelFlags.getOptions('web-compress', { includePrompt: true }),
        // Search options
        { flags: '--web-search-query <text>', description: 'Static search query' },
        { flags: '--web-search-limit <number>', description: 'Max total results (default: 5)', parser: parseInt },
        { flags: '--web-search-mode <mode>', description: 'Content mode: none/markdown/html (default: none)' },
        { flags: '--web-search-query-count <number>', description: 'Queries to generate (default: 3)', parser: parseInt },
        { flags: '--web-search-max-pages <number>', description: 'Max pages per query (default: 1)', parser: parseInt },
        { flags: '--web-search-dedupe-strategy <strategy>', description: 'Deduplication: none/domain/url (default: none)' },
        { flags: '--web-search-gl <country>', description: 'Country code for search' },
        { flags: '--web-search-hl <lang>', description: 'Language code for search' },
        // Output options
        { flags: '--web-search-export', description: 'Merge results into row' },
        { flags: '--web-search-explode', description: 'Explode results into multiple rows' },
        { flags: '--web-search-output <column>', description: 'Save results to column' }
    ];

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return ['hasSerper'];
    }

    parseCLIOptions(options: Record<string, any>, stepIndex: number): WebSearchRawConfigV2 | null {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const query = getOpt('webSearchQuery');
        const queryConfig = ModelFlags.extractPluginModel(options, 'webQuery', stepIndex);
        const selectConfig = ModelFlags.extractPluginModel(options, 'webSelect', stepIndex);
        const compressConfig = ModelFlags.extractPluginModel(options, 'webCompress', stepIndex);

        // Only activate if query or queryPrompt is provided
        if (!query && !queryConfig.prompt) {
            return null;
        }

        // Parse output config
        const exportFlag = getOpt('webSearchExport');
        const explodeFlag = getOpt('webSearchExplode');
        const outputColumn = getOpt('webSearchOutput');

        let outputMode: 'merge' | 'column' | 'ignore' = 'ignore';
        if (outputColumn) outputMode = 'column';
        else if (exportFlag) outputMode = 'merge';

        // Return raw config - Zod will apply defaults
        const partialConfig = {
            type: 'web-search',
            query,
            // Query model
            queryPrompt: queryConfig.prompt,
            queryModel: queryConfig.model,
            queryTemperature: queryConfig.temperature,
            queryThinkingLevel: queryConfig.thinkingLevel,
            // Select model
            selectPrompt: selectConfig.prompt,
            selectModel: selectConfig.model,
            selectTemperature: selectConfig.temperature,
            selectThinkingLevel: selectConfig.thinkingLevel,
            // Compress model
            compressPrompt: compressConfig.prompt,
            compressModel: compressConfig.model,
            compressTemperature: compressConfig.temperature,
            compressThinkingLevel: compressConfig.thinkingLevel,
            // Search options
            limit: getOpt('webSearchLimit'),
            mode: getOpt('webSearchMode'),
            queryCount: getOpt('webSearchQueryCount'),
            maxPages: getOpt('webSearchMaxPages'),
            dedupeStrategy: getOpt('webSearchDedupeStrategy'),
            gl: getOpt('webSearchGl'),
            hl: getOpt('webSearchHl'),
            output: {
                mode: outputMode,
                column: outputColumn,
                explode: explodeFlag
            }
        };

        // Parse through Zod to apply defaults
        return this.configSchema.parse(partialConfig);
    }

    async resolveConfig(
        rawConfig: WebSearchRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
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
            const renderedParts = parts.map(part => {
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
        const { services, row } = context;
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
        // This allows the ResultProcessor to handle 'explode' correctly (one packet = one row),
        // and also produces a cleaner array of objects in 'merge' mode (instead of array-of-arrays).
        const packets: PluginPacket[] = result.data.map(item => {
            const text = `Source: ${item.title} (${item.link})\nContent:\n${item.content}`;
            return {
                data: item,
                contentParts: [{ type: 'text', text }]
            };
        });

        // If no results, return the original "No results" message from AiWebSearch
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
