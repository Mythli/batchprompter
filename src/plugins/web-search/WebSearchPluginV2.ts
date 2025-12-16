import { z } from 'zod';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import {
    Plugin,
    PluginExecutionContext,
    PluginResult,
    CLIOptionDefinition
} from '../types.js';
import { ServiceCapabilities, ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, PromptDefSchema } from '../../config/schema.js';
import { PromptLoader } from '../../config/PromptLoader.js';
import { DEFAULT_OUTPUT } from '../../config/defaults.js';

// =============================================================================
// Raw Config Schema
// =============================================================================

export const WebSearchConfigSchemaV2 = z.object({
    type: z.literal('web-search'),
    id: z.string().optional(),
    output: OutputConfigSchema.optional(),
    query: z.string().optional(),
    queryPrompt: PromptDefSchema.optional(),
    selectPrompt: PromptDefSchema.optional(),
    compressPrompt: PromptDefSchema.optional(),
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
        { flags: '--web-search-query <text>', description: 'Static search query' },
        { flags: '--web-query-prompt <text>', description: 'Query generation prompt' },
        { flags: '--web-select-prompt <text>', description: 'Result selection prompt' },
        { flags: '--web-compress-prompt <text>', description: 'Content compression prompt' },
        { flags: '--web-search-limit <number>', description: 'Max total results', parser: parseInt, defaultValue: 5 },
        { flags: '--web-search-mode <mode>', description: 'Content mode (none/markdown/html)', defaultValue: 'none' },
        { flags: '--web-search-query-count <number>', description: 'Queries to generate', parser: parseInt, defaultValue: 3 },
        { flags: '--web-search-max-pages <number>', description: 'Max pages per query', parser: parseInt, defaultValue: 1 },
        { flags: '--web-search-dedupe-strategy <strategy>', description: 'Deduplication (none/domain/url)', defaultValue: 'none' },
        { flags: '--web-search-gl <country>', description: 'Country code for search' },
        { flags: '--web-search-hl <lang>', description: 'Language code for search' },
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
        const queryPrompt = getOpt('webQueryPrompt');

        // Only activate if query or queryPrompt is provided
        if (!query && !queryPrompt) {
            return null;
        }

        // Parse output config
        const exportFlag = getOpt('webSearchExport');
        const explodeFlag = getOpt('webSearchExplode');
        const outputColumn = getOpt('webSearchOutput');

        let outputMode: 'merge' | 'column' | 'ignore' = 'ignore';
        if (outputColumn) outputMode = 'column';
        else if (exportFlag) outputMode = 'merge';

        return {
            type: 'web-search',
            query,
            queryPrompt,
            selectPrompt: getOpt('webSelectPrompt'),
            compressPrompt: getOpt('webCompressPrompt'),
            limit: getOpt('webSearchLimit') ?? 5,
            mode: getOpt('webSearchMode') ?? 'none',
            queryCount: getOpt('webSearchQueryCount') ?? 3,
            maxPages: getOpt('webSearchMaxPages') ?? 1,
            dedupeStrategy: getOpt('webSearchDedupeStrategy') ?? 'none',
            gl: getOpt('webSearchGl'),
            hl: getOpt('webSearchHl'),
            output: {
                mode: outputMode,
                column: outputColumn,
                explode: explodeFlag ?? false
            }
        };
    }

    async resolveConfig(
        rawConfig: WebSearchRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
    ): Promise<WebSearchResolvedConfigV2> {
        const resolvePrompt = async (prompt: any): Promise<ResolvedModelConfig | undefined> => {
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
                model: inheritedModel.model,
                temperature: inheritedModel.temperature,
                thinkingLevel: inheritedModel.thinkingLevel,
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
                mode: rawConfig.output?.mode ?? DEFAULT_OUTPUT.mode,
                column: rawConfig.output?.column,
                explode: rawConfig.output?.explode ?? DEFAULT_OUTPUT.explode
            },
            query,
            queryModel: await resolvePrompt(rawConfig.queryPrompt),
            selectModel: await resolvePrompt(rawConfig.selectPrompt),
            compressModel: await resolvePrompt(rawConfig.compressPrompt),
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

        // Generate search queries
        const queries: string[] = [];

        if (config.query) {
            queries.push(config.query);
        }

        if (config.queryModel) {
            console.log(`[WebSearch] Generating search queries...`);
            const queryLlm = services.createLlm(config.queryModel);

            const QuerySchema = z.object({
                queries: z.array(z.string()).min(1).max(config.queryCount)
            });

            const response = await queryLlm.promptZod(QuerySchema);
            queries.push(...response.queries);
            console.log(`[WebSearch] Generated queries: ${response.queries.join(', ')}`);
        }

        if (queries.length === 0) {
            return { packets: [] };
        }

        // Execute searches
        const allResults: any[] = [];
        const seenKeys = new Set<string>();

        const getDedupeKey = (result: any): string | null => {
            if (config.dedupeStrategy === 'domain') {
                try {
                    return new URL(result.link).hostname;
                } catch {
                    return result.link;
                }
            }
            if (config.dedupeStrategy === 'url') {
                return result.link;
            }
            return null;
        };

        for (const q of queries) {
            if (allResults.length >= config.limit) break;

            for (let page = 1; page <= config.maxPages; page++) {
                if (allResults.length >= config.limit) break;

                const results = await webSearch.search(q, 10, page, config.gl, config.hl);
                if (results.length === 0) break;

                let selectedResults = results;

                // AI selection if configured
                if (config.selectModel) {
                    console.log(`[WebSearch] Selecting relevant results from page ${page}...`);
                    const selectLlm = services.createLlm(config.selectModel);

                    const listText = results.map((r, i) =>
                        `[${i}] ${r.title}\n    Link: ${r.link}\n    Snippet: ${r.snippet}`
                    ).join('\n\n');

                    const SelectionSchema = z.object({
                        selected_indices: z.array(z.number()),
                        reasoning: z.string()
                    });

                    const response = await selectLlm.promptZod(
                        {
                            suffix: [{ type: 'text', text: `Search results:\n\n${listText}` }]
                        },
                        SelectionSchema
                    );

                    selectedResults = response.selected_indices
                        .map(i => results[i])
                        .filter(r => r !== undefined);
                }

                for (const result of selectedResults) {
                    if (allResults.length >= config.limit) break;

                    const key = getDedupeKey(result);
                    if (key && seenKeys.has(key)) continue;
                    if (key) seenKeys.add(key);

                    // Fetch content if needed
                    let content = result.snippet || '';
                    if (config.mode !== 'none') {
                        const rawContent = await webSearch.fetchContent(result.link, config.mode);
                        content = rawContent || content;
                    }

                    // Compress if configured
                    if (config.compressModel && content) {
                        const compressLlm = services.createLlm(config.compressModel);
                        const truncated = content.substring(0, 15000);
                        content = await compressLlm.promptText({
                            suffix: [{ type: 'text', text: `Title: ${result.title}\nLink: ${result.link}\n\nContent:\n${truncated}` }]
                        });
                    }

                    let domain: string | undefined;
                    try {
                        domain = new URL(result.link).hostname;
                    } catch {}

                    allResults.push({
                        ...result,
                        content,
                        domain,
                        type: 'seo'
                    });
                }
            }
        }

        if (allResults.length === 0) {
            return {
                packets: [{
                    data: [],
                    contentParts: [{ type: 'text', text: 'No results found.' }]
                }]
            };
        }

        // Build content parts
        const contentText = allResults.map(r =>
            `Source: ${r.title} (${r.link})\n${r.content || r.snippet || ''}`
        ).join('\n\n');

        const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            { type: 'text', text: `\n--- Web Search Results ---\n${contentText}\n--------------------------\n` }
        ];

        return {
            packets: [{
                data: allResults,
                contentParts
            }]
        };
    }
}
