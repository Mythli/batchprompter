import { Command } from 'commander';
import { ImageSearchPluginV2 } from 'batchprompt';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';
import { ModelFlags } from '../ModelFlags.js';

export class ImageSearchAdapter implements CliPluginAdapter {
    constructor(public plugin: ImageSearchPluginV2) {}

    registerOptions(program: Command) {
        ModelFlags.register(program, 'image-query', { includePrompt: true });
        ModelFlags.register(program, 'image-select', { includePrompt: true });

        program.option('--image-search-query <text>', 'Static image search query');
        program.option('--image-search-limit <number>', 'Images per query (default: 12)', parseInt);
        program.option('--image-search-select <number>', 'Images to select (default: 1)', parseInt);
        program.option('--image-search-query-count <number>', 'Queries to generate (default: 3)', parseInt);
        program.option('--image-search-sprite-size <number>', 'Images per sprite (default: 4)', parseInt);
        program.option('--image-search-max-pages <number>', 'Max pages per query (default: 1)', parseInt);
        program.option('--image-search-dedupe-strategy <strategy>', 'Deduplication (default: url)');
        program.option('--image-search-gl <country>', 'Country code');
        program.option('--image-search-hl <lang>', 'Language code');
        program.option('--image-search-export', 'Merge results into row');
        program.option('--image-search-explode', 'Explode results');
        program.option('--image-search-output <column>', 'Save to column');
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const registerStep = (flags: string, desc: string, parser?: any) => {
            const stepFlags = flags.replace(/^(--[\w-]+)/, `$1-${stepIndex}`);
            program.option(stepFlags, `${desc} for step ${stepIndex}`, parser);
        };

        ModelFlags.register(program, `image-query-${stepIndex}`, { includePrompt: true });
        ModelFlags.register(program, `image-select-${stepIndex}`, { includePrompt: true });

        registerStep('--image-search-query <text>', 'Static image search query');
        registerStep('--image-search-limit <number>', 'Images per query', parseInt);
        registerStep('--image-search-select <number>', 'Images to select', parseInt);
        registerStep('--image-search-query-count <number>', 'Queries to generate', parseInt);
        registerStep('--image-search-sprite-size <number>', 'Images per sprite', parseInt);
        registerStep('--image-search-max-pages <number>', 'Max pages per query', parseInt);
        registerStep('--image-search-dedupe-strategy <strategy>', 'Deduplication');
        registerStep('--image-search-gl <country>', 'Country code');
        registerStep('--image-search-hl <lang>', 'Language code');
        registerStep('--image-search-export', 'Merge results into row');
        registerStep('--image-search-explode', 'Explode results');
        registerStep('--image-search-output <column>', 'Save to column');
    }

    parseOptions(options: Record<string, any>, stepIndex: number) {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const query = getOpt('imageSearchQuery');
        const queryConfig = ModelFlags.extractPluginModel(options, 'imageQuery', stepIndex);
        const selectConfig = ModelFlags.extractPluginModel(options, 'imageSelect', stepIndex);

        if (!query && !queryConfig.prompt && !selectConfig.prompt) {
            return null;
        }

        const exportFlag = getOpt('imageSearchExport');
        const explodeFlag = getOpt('imageSearchExplode');
        const outputColumn = getOpt('imageSearchOutput');

        let outputMode: 'merge' | 'column' | 'ignore' = 'ignore';
        if (outputColumn) outputMode = 'column';
        else if (exportFlag) outputMode = 'merge';

        return {
            type: 'image-search',
            query,
            queryPrompt: queryConfig.prompt,
            queryModel: queryConfig.model,
            queryTemperature: queryConfig.temperature,
            queryThinkingLevel: queryConfig.thinkingLevel,
            selectPrompt: selectConfig.prompt,
            selectModel: selectConfig.model,
            selectTemperature: selectConfig.temperature,
            selectThinkingLevel: selectConfig.thinkingLevel,
            limit: getOpt('imageSearchLimit'),
            select: getOpt('imageSearchSelect'),
            queryCount: getOpt('imageSearchQueryCount'),
            spriteSize: getOpt('imageSearchSpriteSize'),
            maxPages: getOpt('imageSearchMaxPages'),
            dedupeStrategy: getOpt('imageSearchDedupeStrategy'),
            gl: getOpt('imageSearchGl'),
            hl: getOpt('imageSearchHl'),
            output: {
                mode: outputMode,
                column: outputColumn,
                explode: explodeFlag
            }
        };
    }
}
