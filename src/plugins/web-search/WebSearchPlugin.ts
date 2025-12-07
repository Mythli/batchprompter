import { Command } from 'commander';
import OpenAI from 'openai';
import Handlebars from 'handlebars';
import { ContentProviderPlugin, PluginContext, PluginResult, NormalizedPluginConfig } from '../types.js';
import { ModelFlags } from '../../cli/ModelFlags.js';
import { ModelDefinition, ResolvedModelConfig } from '../../types.js';
import { PluginHelpers } from '../../utils/PluginHelpers.js';
import { WebSearchMode } from './WebSearch.js';

interface WebSearchRawConfig {
    query?: string;
    queryConfig?: ModelDefinition;
    selectConfig?: ModelDefinition;
    compressConfig?: ModelDefinition;
    limit: number;
    mode: WebSearchMode;
    queryCount: number;
    
    // Pagination & Dedupe
    paginate: boolean;
    pageSize: number;
    maxPages: number;
    dedupeStrategy: 'none' | 'domain' | 'url';
}

interface WebSearchResolvedConfig {
    query?: string;
    queryConfig?: ResolvedModelConfig;
    selectConfig?: ResolvedModelConfig;
    compressConfig?: ResolvedModelConfig;
    limit: number;
    mode: WebSearchMode;
    queryCount: number;
    
    paginate: boolean;
    pageSize: number;
    maxPages: number;
    dedupeStrategy: 'none' | 'domain' | 'url';
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
        program.option('--web-search-mode <mode>', 'Result mode: none, markdown, html', 'markdown');
        program.option('--web-search-query-count <number>', 'Queries to generate', '3');
        
        // Pagination & Dedupe
        program.option('--web-search-paginate', 'Enable pagination loop', false);
        program.option('--web-search-page-size <number>', 'Results per page (and AI batch size)', '20');
        program.option('--web-search-max-pages <number>', 'Max pages to fetch per query', '10');
        program.option('--web-search-dedupe-strategy <strategy>', 'Deduplication strategy (none, domain, url)', 'none');
    }

    registerStep(program: Command, stepIndex: number): void {
        ModelFlags.register(program, `web-query-${stepIndex}`, { includePrompt: true });
        ModelFlags.register(program, `web-select-${stepIndex}`, { includePrompt: true });
        ModelFlags.register(program, `web-compress-${stepIndex}`, { includePrompt: true });

        program.option(`--web-search-query-${stepIndex} <text>`, `Static search query for step ${stepIndex}`);
        program.option(`--web-search-limit-${stepIndex} <number>`, `Max total results for step ${stepIndex}`);
        program.option(`--web-search-mode-${stepIndex} <mode>`, `Result mode for step ${stepIndex}`);
        program.option(`--web-search-query-count-${stepIndex} <number>`, `Query count for step ${stepIndex}`);
        
        program.option(`--web-search-paginate-${stepIndex}`, `Enable pagination for step ${stepIndex}`);
        program.option(`--web-search-page-size-${stepIndex} <number>`, `Page size for step ${stepIndex}`);
        program.option(`--web-search-max-pages-${stepIndex} <number>`, `Max pages for step ${stepIndex}`);
        program.option(`--web-search-dedupe-strategy-${stepIndex} <strategy>`, `Dedupe strategy for step ${stepIndex}`);
    }

    normalize(options: Record<string, any>, stepIndex: number, globalConfig: any): NormalizedPluginConfig | undefined {
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

        const config: WebSearchRawConfig = {
            query,
            queryConfig,
            selectConfig,
            compressConfig,
            limit: parseInt(getOpt('webSearchLimit') || '5', 10),
            mode: (getOpt('webSearchMode') || 'markdown') as WebSearchMode,
            queryCount: parseInt(getOpt('webSearchQueryCount') || '3', 10),
            
            paginate: !!getOpt('webSearchPaginate'),
            pageSize: parseInt(getOpt('webSearchPageSize') || '20', 10),
            maxPages: parseInt(getOpt('webSearchMaxPages') || '10', 10),
            dedupeStrategy: (getOpt('webSearchDedupeStrategy') || 'none') as 'none' | 'domain' | 'url'
        };

        return {
            config
        };
    }

    async prepare(config: WebSearchRawConfig, row: Record<string, any>): Promise<WebSearchResolvedConfig> {
        const resolved: WebSearchResolvedConfig = {
            limit: config.limit,
            mode: config.mode,
            queryCount: config.queryCount,
            paginate: config.paginate,
            pageSize: config.pageSize,
            maxPages: config.maxPages,
            dedupeStrategy: config.dedupeStrategy
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
        const { row, stepIndex, config, services } = context;
        const resolvedConfig = config as WebSearchResolvedConfig;

        if (!services.webSearch || !services.aiWebSearch) {
            throw new Error(`Step ${stepIndex} requires Web Search, but SERPER_API_KEY is missing.`);
        }

        const { contentParts, data } = await services.aiWebSearch.process(row, resolvedConfig);

        return {
            contentParts,
            data
        };
    }
}
