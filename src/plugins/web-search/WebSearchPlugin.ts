import { Command } from 'commander';
import OpenAI from 'openai';
import Handlebars from 'handlebars';
import { ContentProviderPlugin, PluginContext } from '../types.js';
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
}

interface WebSearchResolvedConfig {
    query?: string;
    queryConfig?: ResolvedModelConfig;
    selectConfig?: ResolvedModelConfig;
    compressConfig?: ResolvedModelConfig;
    limit: number;
    mode: WebSearchMode;
    queryCount: number;
}

export class WebSearchPlugin implements ContentProviderPlugin {
    name = 'web-search';

    constructor() {}

    register(program: Command): void {
        ModelFlags.register(program, 'web-query', { includePrompt: true });
        ModelFlags.register(program, 'web-select', { includePrompt: true });
        ModelFlags.register(program, 'web-compress', { includePrompt: true });

        program.option('--web-search-query <text>', 'Static search query');
        program.option('--web-search-limit <number>', 'Max results', '5');
        program.option('--web-search-mode <mode>', 'Result mode: none, markdown, html', 'markdown');
        program.option('--web-search-query-count <number>', 'Queries to generate', '3');
    }

    registerStep(program: Command, stepIndex: number): void {
        ModelFlags.register(program, `web-query-${stepIndex}`, { includePrompt: true });
        ModelFlags.register(program, `web-select-${stepIndex}`, { includePrompt: true });
        ModelFlags.register(program, `web-compress-${stepIndex}`, { includePrompt: true });

        program.option(`--web-search-query-${stepIndex} <text>`, `Static search query for step ${stepIndex}`);
        program.option(`--web-search-limit-${stepIndex} <number>`, `Max results for step ${stepIndex}`);
        program.option(`--web-search-mode-${stepIndex} <mode>`, `Result mode for step ${stepIndex}`);
        program.option(`--web-search-query-count-${stepIndex} <number>`, `Query count for step ${stepIndex}`);
    }

    normalize(options: Record<string, any>, stepIndex: number, globalConfig: any): WebSearchRawConfig | undefined {
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

        return {
            query,
            queryConfig,
            selectConfig,
            compressConfig,
            limit: parseInt(getOpt('webSearchLimit') || '5', 10),
            mode: (getOpt('webSearchMode') || 'markdown') as WebSearchMode,
            queryCount: parseInt(getOpt('webSearchQueryCount') || '3', 10)
        };
    }

    async prepare(config: WebSearchRawConfig, row: Record<string, any>): Promise<WebSearchResolvedConfig> {
        const resolved: WebSearchResolvedConfig = {
            limit: config.limit,
            mode: config.mode,
            queryCount: config.queryCount
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

    async execute(context: PluginContext): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        const { row, stepIndex, config, services } = context;
        const resolvedConfig = config as WebSearchResolvedConfig;

        if (!services.webSearch || !services.aiWebSearch) {
            throw new Error(`Step ${stepIndex} requires Web Search, but SERPER_API_KEY is missing.`);
        }

        const results = await services.aiWebSearch.process(row, resolvedConfig);

        if (results.length === 0) return [];

        return [{
            type: 'text',
            text: `\n--- Web Search Results ---\n${results.join('\n\n')}\n--------------------------\n`
        }];
    }
}
