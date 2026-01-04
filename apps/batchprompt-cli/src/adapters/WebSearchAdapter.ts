import { Command } from 'commander';
import { WebSearchPluginV2 } from 'batchprompt';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';
import { ModelFlags } from '../ModelFlags.js';

export class WebSearchAdapter implements CliPluginAdapter {
    constructor(public plugin: WebSearchPluginV2) {}

    registerOptions(program: Command) {
        ModelFlags.register(program, 'web-query', { includePrompt: true });
        ModelFlags.register(program, 'web-select', { includePrompt: true });
        ModelFlags.register(program, 'web-compress', { includePrompt: true });
        
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
        // ModelFlags handles step registration internally if we pass the namespace with suffix?
        // No, ModelFlags.register takes a namespace. We need to register for step.
        // But ModelFlags.register doesn't support step index directly in the current implementation shown in previous context.
        // Wait, ModelFlags.register takes a namespace. If we want step specific flags, we need to register them manually or update ModelFlags.
        // The previous implementation of PluginRegistryV2.registerCLI did this:
        // const stepFlags = this.makeStepFlags(opt.flags, i);
        // It regex replaced the flag name.
        
        // Let's replicate that logic here for the specific flags.
        const registerStep = (flags: string, desc: string, parser?: any) => {
            const stepFlags = flags.replace(/^(--[\w-]+)/, `$1-${stepIndex}`);
            program.option(stepFlags, `${desc} for step ${stepIndex}`, parser);
        };

        // For ModelFlags, we can use the namespace with suffix
        ModelFlags.register(program, `web-query-${stepIndex}`, { includePrompt: true });
        ModelFlags.register(program, `web-select-${stepIndex}`, { includePrompt: true });
        ModelFlags.register(program, `web-compress-${stepIndex}`, { includePrompt: true });

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
        
        // For ModelFlags extraction, we need to handle the step suffix logic.
        // ModelFlags.extractPluginModel handles the step index logic internally if we pass the base prefix.
        const queryConfig = ModelFlags.extractPluginModel(options, 'webQuery', stepIndex);
        const selectConfig = ModelFlags.extractPluginModel(options, 'webSelect', stepIndex);
        const compressConfig = ModelFlags.extractPluginModel(options, 'webCompress', stepIndex);

        // Only activate if query or queryPrompt is provided
        if (!query && !queryConfig.prompt) {
            return null;
        }

        const exportFlag = getOpt('webSearchExport');
        const explodeFlag = getOpt('webSearchExplode');
        const outputColumn = getOpt('webSearchOutput');

        let outputMode: 'merge' | 'column' | 'ignore' = 'ignore';
        if (outputColumn) outputMode = 'column';
        else if (exportFlag) outputMode = 'merge';

        return {
            type: 'web-search',
            query,
            queryPrompt: queryConfig.prompt,
            queryModel: queryConfig.model,
            queryTemperature: queryConfig.temperature,
            queryThinkingLevel: queryConfig.thinkingLevel,
            selectPrompt: selectConfig.prompt,
            selectModel: selectConfig.model,
            selectTemperature: selectConfig.temperature,
            selectThinkingLevel: selectConfig.thinkingLevel,
            compressPrompt: compressConfig.prompt,
            compressModel: compressConfig.model,
            compressTemperature: compressConfig.temperature,
            compressThinkingLevel: compressConfig.thinkingLevel,
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
