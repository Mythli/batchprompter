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
    maxPages: number;
    dedupeStrategy: 'none' | 'domain' | 'url';

    // Localization
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

        // Pagination & Dedupe
        program.option('--web-search-max-pages <number>', 'Max pages to fetch per query', '1');
        program.option('--web-search-dedupe-strategy <strategy>', 'Deduplication strategy (none, domain, url)', 'none');

        // Localization
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

            maxPages: parseInt(getOpt('webSearchMaxPages') || '1', 10),
            dedupeStrategy: (getOpt('webSearchDedupeStrategy') || 'none') as 'none' | 'domain' | 'url',

            gl: getOpt('webSearchGl'),
            hl: getOpt('webSearchHl')
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
        const { row, stepIndex, config, services, output } = context;
        const resolvedConfig = config as WebSearchResolvedConfig;

        if (!services.webSearch || !services.aiWebSearch) {
            throw new Error(`Step ${stepIndex} requires Web Search, but SERPER_API_KEY is missing.`);
        }

        const { contentParts, data } = await services.aiWebSearch.process(row, resolvedConfig);

        // Flow Control:
        // If explode is enabled, we return the array of results directly (1:N).
        // If explode is disabled (default), we wrap the array in another array (1:1).
        
        if (output.explode) {
            return {
                contentParts,
                data: data // Explode: [Result1, Result2, ...]
            };
        } else {
            return {
                contentParts,
                data: [data] // Enrich: [ [Result1, Result2, ...] ]
            };
        }
    }
}
