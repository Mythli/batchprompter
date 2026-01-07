import { Command } from 'commander';
import { WebSearchPluginV2 } from 'batchprompt';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';
import { ModelFlags } from '../ModelFlags.js';

export class WebSearchAdapter implements CliPluginAdapter {
    constructor(public plugin: WebSearchPluginV2) {}

    registerOptions(program: Command) {
        ModelFlags.register(program, 'web-query', { includePrompt: true, includeSystem: true });
        ModelFlags.register(program, 'web-select', { includePrompt: true, includeSystem: true });
        ModelFlags.register(program, 'web-compress', { includePrompt: true, includeSystem: true });
        
        program.option('--web-search-query <text>', 'Static search query');
        program.option('--web-search-limit <number>', 'Max total results (default: 5)', parseInt);
        program.option('--web-search-mode <mode>', 'Content mode: none/markdown/html (default: none)');
        program.option('--web-search-query-count <number>', 'Queries to generate (default: 3)', parseInt);
        program.option('--web-search-max-pages <number>', 'Max pages per query (default: 1)', parseInt);
        program.option('--web-search-dedupe-strategy <strategy>', 'Deduplication: none/domain/url (default: none)');
        program.option('--web-search-gl <country>', 'Country code for search');
        program.option('--web-search-hl <lang>', 'Language code for search');
        program.option('--web-search-export', 'Merge results into row');
        program.option('--web-search-explode', 'Explode results into multiple rows');
        program.option('--web-search-output <column>', 'Save results to column');
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const registerStep = (flags: string, desc: string, parser?: any) => {
            const stepFlags = flags.replace(/^(--[\w-]+)/, `$1-${stepIndex}`);
            program.option(stepFlags, `${desc} for step ${stepIndex}`, parser);
        };

        ModelFlags.register(program, `web-query-${stepIndex}`, { includePrompt: true, includeSystem: true });
        ModelFlags.register(program, `web-select-${stepIndex}`, { includePrompt: true, includeSystem: true });
        ModelFlags.register(program, `web-compress-${stepIndex}`, { includePrompt: true, includeSystem: true });

        registerStep('--web-search-query <text>', 'Static search query');
        registerStep('--web-search-limit <number>', 'Max total results', parseInt);
        registerStep('--web-search-mode <mode>', 'Content mode');
        registerStep('--web-search-query-count <number>', 'Queries to generate', parseInt);
        registerStep('--web-search-max-pages <number>', 'Max pages per query', parseInt);
        registerStep('--web-search-dedupe-strategy <strategy>', 'Deduplication');
        registerStep('--web-search-gl <country>', 'Country code');
        registerStep('--web-search-hl <lang>', 'Language code');
        registerStep('--web-search-export', 'Merge results into row');
        registerStep('--web-search-explode', 'Explode results');
        registerStep('--web-search-output <column>', 'Save results to column');
    }

    parseOptions(options: Record<string, any>, stepIndex: number) {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const query = getOpt('webSearchQuery');
        
        const queryConfig = ModelFlags.extractPluginModel(options, 'webQuery', stepIndex);
        const selectConfig = ModelFlags.extractPluginModel(options, 'webSelect', stepIndex);
        const compressConfig = ModelFlags.extractPluginModel(options, 'webCompress', stepIndex);

        // Only activate if query or queryModel.prompt is provided
        if (!query && !queryConfig.prompt) {
            return null;
        }

        const exportFlag = getOpt('webSearchExport');
        const explodeFlag = getOpt('webSearchExplode');
        const outputColumn = getOpt('webSearchOutput');

        let outputMode: 'merge' | 'column' | 'ignore' = 'ignore';
        if (outputColumn) outputMode = 'column';
        else if (exportFlag) outputMode = 'merge';

        // Build nested model config objects
        const buildModelConfig = (config: any) => {
            if (!config.prompt && !config.model && !config.temperature && !config.thinkingLevel && !config.system) {
                return undefined;
            }
            return {
                model: config.model,
                temperature: config.temperature,
                thinkingLevel: config.thinkingLevel,
                prompt: config.prompt,
                system: config.system
            };
        };

        return {
            type: 'web-search',
            query,
            queryModel: buildModelConfig(queryConfig),
            selectModel: buildModelConfig(selectConfig),
            compressModel: buildModelConfig(compressConfig),
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
    }
}
