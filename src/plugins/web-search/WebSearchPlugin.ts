import { Command } from 'commander';
import Handlebars from 'handlebars';
import { ContentProviderPlugin, PluginContext, PluginResult, NormalizedPluginConfig, PluginPacket } from '../types.js';
import { ModelFlags } from '../../cli/ModelFlags.js';
import { ModelDefinition, ResolvedModelConfig, ServiceCapabilities } from '../../types.js';
import { PluginHelpers } from '../../utils/PluginHelpers.js';
import { WebSearchMode } from './WebSearch.js';
import { AiWebSearch } from '../../utils/AiWebSearch.js';

interface WebSearchRawConfig {
    query?: string;
    queryConfig?: ModelDefinition;
    selectConfig?: ModelDefinition;
    compressConfig?: ModelDefinition;
    limit: number;
    mode: WebSearchMode;
    queryCount: number;
    maxPages: number;
    dedupeStrategy: 'none' | 'domain' | 'url';
    gl?: string;
    hl?: string;
}

interface WebSearchResolvedConfig {
    query?: string;
    queryConfig?: ResolvedModelConfig;
    selectConfig?: ResolvedModelConfig;
    compressConfig?: ResolvedModelConfig;
    limit: number;
    mode: WebSearchMode;
    queryCount: number;
    maxPages: number;
    dedupeStrategy: 'none' | 'domain' | 'url';
    gl?: string;
    hl?: string;
}

export class WebSearchPlugin implements ContentProviderPlugin {
    name = 'web-search';

    constructor() {}

    register(program: Command): void {
        ModelFlags.register(program, 'web-query', { includePrompt: true });
        ModelFlags.register(program, 'web-select', { includePrompt: true });
        ModelFlags.register(program, 'web-compress', { includePrompt: true });

        program.option('--web-search-query <text>', 'Static search query');
        program.option('--web-search-limit <number>', 'Max total results (accumulated)', '5');
        program.option('--web-search-mode <mode>', 'Result mode: none, markdown, html', 'none');
        program.option('--web-search-query-count <number>', 'Queries to generate', '3');
        program.option('--web-search-max-pages <number>', 'Max pages to fetch per query', '1');
        program.option('--web-search-dedupe-strategy <strategy>', 'Deduplication strategy (none, domain, url)', 'none');
        program.option('--web-search-gl <country>', 'Country code for search results (e.g. us, de)');
        program.option('--web-search-hl <lang>', 'Language code for search results (e.g. en, de)');
    }

    registerStep(program: Command, stepIndex: number): void {
        ModelFlags.register(program, `web-query-${stepIndex}`, { includePrompt: true });
        ModelFlags.register(program, `web-select-${stepIndex}`, { includePrompt: true });
        ModelFlags.register(program, `web-compress-${stepIndex}`, { includePrompt: true });

        program.option(`--web-search-query-${stepIndex} <text>`, `Static search query for step ${stepIndex}`);
        program.option(`--web-search-limit-${stepIndex} <number>`, `Max total results for step ${stepIndex}`);
        program.option(`--web-search-mode-${stepIndex} <mode>`, `Result mode for step ${stepIndex}`);
        program.option(`--web-search-query-count-${stepIndex} <number>`, `Query count for step ${stepIndex}`);
        program.option(`--web-search-max-pages-${stepIndex} <number>`, `Max pages for step ${stepIndex}`);
        program.option(`--web-search-dedupe-strategy-${stepIndex} <strategy>`, `Dedupe strategy for step ${stepIndex}`);
        program.option(`--web-search-gl-${stepIndex} <country>`, `Country code for step ${stepIndex}`);
        program.option(`--web-search-hl-${stepIndex} <lang>`, `Language code for step ${stepIndex}`);
    }

    normalize(
        options: Record<string, any>, 
        stepIndex: number, 
        globalConfig: any,
        capabilities: ServiceCapabilities
    ): NormalizedPluginConfig | undefined {
        const modelFlags = new ModelFlags(globalConfig.model);

        const extractModel = (namespace: string, fallbackNamespace: string): ModelDefinition | undefined => {
            const config = modelFlags.extract(options, namespace, fallbackNamespace);
            if (!config.promptSource && !config.systemSource && !config.model) return undefined;
            if (!config.promptSource && !config.systemSource) return undefined;
            return config as ModelDefinition;
        };

        const getOpt = (key: string) => {
            const specific = options[`${key}${stepIndex}`];
            if (specific !== undefined) return specific;
            return options[key];
        };

        const queryConfig = extractModel(`web-query-${stepIndex}`, 'web-query');
        const selectConfig = extractModel(`web-select-${stepIndex}`, 'web-select');
        const compressConfig = extractModel(`web-compress-${stepIndex}`, 'web-compress');
        const query = getOpt('webSearchQuery');

        const isActive = !!(query || queryConfig);

        if (!isActive) return undefined;

        if (!capabilities.hasSerper) {
            throw new Error(
                `Step ${stepIndex} Web Search requires SERPER_API_KEY environment variable to be set.`
            );
        }

        const config: WebSearchRawConfig = {
            query,
            queryConfig,
            selectConfig,
            compressConfig,
            limit: parseInt(getOpt('webSearchLimit') || '5', 10),
            mode: (getOpt('webSearchMode') || 'markdown') as WebSearchMode,
            queryCount: parseInt(getOpt('webSearchQueryCount') || '3', 10),
            maxPages: parseInt(getOpt('webSearchMaxPages') || '1', 10),
            dedupeStrategy: (getOpt('webSearchDedupeStrategy') || 'none') as 'none' | 'domain' | 'url',
            gl: getOpt('webSearchGl'),
            hl: getOpt('webSearchHl')
        };

        return { config };
    }

    async prepare(config: WebSearchRawConfig, row: Record<string, any>): Promise<WebSearchResolvedConfig> {
        const resolved: WebSearchResolvedConfig = {
            limit: config.limit,
            mode: config.mode,
            queryCount: config.queryCount,
            maxPages: config.maxPages,
            dedupeStrategy: config.dedupeStrategy,
            gl: config.gl,
            hl: config.hl
        };

        if (config.query) {
            resolved.query = Handlebars.compile(config.query, { noEscape: true })(row);
        }

        if (config.queryConfig) {
            resolved.queryConfig = await PluginHelpers.resolveModelConfig(config.queryConfig, row);
        }

        if (config.selectConfig) {
            resolved.selectConfig = await PluginHelpers.resolveModelConfig(config.selectConfig, row);
        }

        if (config.compressConfig) {
            resolved.compressConfig = await PluginHelpers.resolveModelConfig(config.compressConfig, row);
        }

        return resolved;
    }

    async execute(context: PluginContext): Promise<PluginResult> {
        const { row, stepIndex, config, stepContext } = context;
        const resolvedConfig = config as WebSearchResolvedConfig;

        const webSearch = stepContext.global.webSearch!;

        const queryLlm = resolvedConfig.queryConfig 
            ? stepContext.createLlm(resolvedConfig.queryConfig) 
            : undefined;
        const selectLlm = resolvedConfig.selectConfig
            ? stepContext.createLlm(resolvedConfig.selectConfig)
            : undefined;
        const compressLlm = resolvedConfig.compressConfig
            ? stepContext.createLlm(resolvedConfig.compressConfig)
            : undefined;

        const aiWebSearch = new AiWebSearch(
            webSearch,
            queryLlm,
            selectLlm,
            compressLlm
        );

        const { contentParts, data } = await aiWebSearch.process(row, resolvedConfig);

        // If mode is 'none', we just return one packet with all data and the summary text.
        if (resolvedConfig.mode === 'none') {
            return {
                packets: [{
                    data: data,
                    contentParts: contentParts
                }]
            };
        }

        // If mode is 'markdown' or 'html', we can potentially explode the results.
        // Each result in 'data' corresponds to one search result.
        // However, 'contentParts' currently contains a single merged string of all results.
        // To support true explosion, AiWebSearch would need to return individual content parts per result.
        // For now, we will stick to the single packet behavior for WebSearch to maintain compatibility,
        // unless we refactor AiWebSearch to return granular results.
        
        // Given the current implementation of AiWebSearch.process returning a single merged text block,
        // we wrap it in a single packet.
        
        return {
            packets: [{
                data: data,
                contentParts: contentParts
            }]
        };
    }
}
