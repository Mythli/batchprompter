import { Command } from 'commander';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class ImageSearchAdapter implements CliPluginAdapter {
    readonly pluginType = 'imageSearch';

    registerOptions(program: Command) {
        program.option('--image-search-query <text>', 'Static search query');
        program.option('--image-search-limit <number>', 'Max total results (default: 5)', parseInt);
        program.option('--image-search-query-count <number>', 'Queries to generate (default: 3)', parseInt);
        program.option('--image-search-max-pages <number>', 'Max pages per query (default: 1)', parseInt);
        program.option('--image-search-dedupe-strategy <strategy>', 'Deduplication: none/domain/url (default: none)');
        program.option('--image-search-gl <country>', 'Country code for search');
        program.option('--image-search-hl <lang>', 'Language code for search');
        program.option('--image-search-query-model <model>', 'Model for query generation');
        program.option('--image-search-query-prompt <text>', 'Prompt for query generation');
        program.option('--image-search-select-model <model>', 'Model for result selection');
        program.option('--image-search-select-prompt <text>', 'Prompt for result selection');
        program.option('--image-search-output-mode <mode>', 'Output mode: merge/column/ignore');
        program.option('--image-search-output-column <column>', 'Output column name');
        program.option('--image-search-output-explode', 'Explode results into multiple rows');
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const s = stepIndex;
        program.option(`--${s}-image-search-query <text>`, `Search query for step ${s}`);
        program.option(`--${s}-image-search-limit <number>`, `Max results for step ${s}`, parseInt);
        program.option(`--${s}-image-search-query-count <number>`, `Queries to generate for step ${s}`, parseInt);
        program.option(`--${s}-image-search-max-pages <number>`, `Max pages for step ${s}`, parseInt);
        program.option(`--${s}-image-search-dedupe-strategy <strategy>`, `Deduplication for step ${s}`);
        program.option(`--${s}-image-search-gl <country>`, `Country code for step ${s}`);
        program.option(`--${s}-image-search-hl <lang>`, `Language code for step ${s}`);
        program.option(`--${s}-image-search-query-model <model>`, `Query model for step ${s}`);
        program.option(`--${s}-image-search-query-prompt <text>`, `Query prompt for step ${s}`);
        program.option(`--${s}-image-search-select-model <model>`, `Select model for step ${s}`);
        program.option(`--${s}-image-search-select-prompt <text>`, `Select prompt for step ${s}`);
        program.option(`--${s}-image-search-output-mode <mode>`, `Output mode for step ${s}`);
        program.option(`--${s}-image-search-output-column <column>`, `Output column for step ${s}`);
        program.option(`--${s}-image-search-output-explode`, `Explode results for step ${s}`);
    }

    parseOptions(options: Record<string, any>, stepIndex: number): Record<string, any> | null {
        const getOpt = (key: string) => {
            const stepKey = `${stepIndex}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
            return options[stepKey] ?? options[key];
        };

        const query = getOpt('imageSearchQuery');
        const queryPrompt = getOpt('imageSearchQueryPrompt');
        const selectPrompt = getOpt('imageSearchSelectPrompt');

        if (!query && !queryPrompt) return null;

        const result: Record<string, any> = { type: 'imageSearch' };

        if (query) result.query = query;
        if (getOpt('imageSearchLimit') !== undefined) result.limit = getOpt('imageSearchLimit');
        if (getOpt('imageSearchQueryCount') !== undefined) result.queryCount = getOpt('imageSearchQueryCount');
        if (getOpt('imageSearchMaxPages') !== undefined) result.maxPages = getOpt('imageSearchMaxPages');
        if (getOpt('imageSearchDedupeStrategy')) result.dedupeStrategy = getOpt('imageSearchDedupeStrategy');
        if (getOpt('imageSearchGl')) result.gl = getOpt('imageSearchGl');
        if (getOpt('imageSearchHl')) result.hl = getOpt('imageSearchHl');

        const qModel = getOpt('imageSearchQueryModel');
        if (queryPrompt || qModel) {
            result.queryModel = {};
            if (qModel) result.queryModel.model = qModel;
            if (queryPrompt) result.queryModel.prompt = queryPrompt;
        }

        const sModel = getOpt('imageSearchSelectModel');
        if (selectPrompt || sModel) {
            result.selectModel = {};
            if (sModel) result.selectModel.model = sModel;
            if (selectPrompt) result.selectModel.prompt = selectPrompt;
        }

        const outputMode = getOpt('imageSearchOutputMode');
        const outputColumn = getOpt('imageSearchOutputColumn');
        const outputExplode = getOpt('imageSearchOutputExplode');
        if (outputMode || outputColumn || outputExplode) {
            result.output = {};
            if (outputMode) result.output.mode = outputMode;
            if (outputColumn) result.output.column = outputColumn;
            if (outputExplode) result.output.explode = true;
        }

        return result;
    }
}
