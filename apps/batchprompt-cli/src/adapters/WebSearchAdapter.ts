import { Command } from 'commander';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class WebSearchAdapter implements CliPluginAdapter {
    readonly pluginType = 'webSearch';

    registerOptionsForStep(program: Command, stepIndex: number) {
        const s = stepIndex;
        program.option(`--${s}-web-search-query <text>`, `Search query for step ${s}`);
        program.option(`--${s}-web-search-limit <number>`, `Max results for step ${s}`, parseInt);
        program.option(`--${s}-web-search-mode <mode>`, `Content mode for step ${s}`);
        program.option(`--${s}-web-search-query-count <number>`, `Queries to generate for step ${s}`, parseInt);
        program.option(`--${s}-web-search-max-pages <number>`, `Max pages for step ${s}`, parseInt);
        program.option(`--${s}-web-search-dedupe-strategy <strategy>`, `Deduplication for step ${s}`);
        program.option(`--${s}-web-search-gl <country>`, `Country code for step ${s}`);
        program.option(`--${s}-web-search-hl <lang>`, `Language code for step ${s}`);
        program.option(`--${s}-web-search-query-model <model>`, `Query model for step ${s}`);
        program.option(`--${s}-web-search-query-prompt <text>`, `Query prompt for step ${s}`);
        program.option(`--${s}-web-search-select-model <model>`, `Select model for step ${s}`);
        program.option(`--${s}-web-search-select-prompt <text>`, `Select prompt for step ${s}`);
        program.option(`--${s}-web-search-compress-model <model>`, `Compress model for step ${s}`);
        program.option(`--${s}-web-search-compress-prompt <text>`, `Compress prompt for step ${s}`);
        program.option(`--${s}-web-search-output-mode <mode>`, `Output mode for step ${s}`);
        program.option(`--${s}-web-search-output-column <column>`, `Output column for step ${s}`);
        program.option(`--${s}-web-search-output-explode`, `Explode results for step ${s}`);
    }

    parseOptions(options: Record<string, any>, stepIndex: number): Record<string, any> | null {
        const getOpt = (key: string) => {
            const stepKey = `${stepIndex}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
            return options[stepKey];
        };

        const query = getOpt('webSearchQuery');
        const queryPrompt = getOpt('webSearchQueryPrompt');
        const selectPrompt = getOpt('webSearchSelectPrompt');

        if (!query && !queryPrompt) return null;

        const result: Record<string, any> = { type: 'webSearch' };

        if (query) result.query = query;
        if (getOpt('webSearchLimit') !== undefined) result.limit = getOpt('webSearchLimit');
        if (getOpt('webSearchMode')) result.mode = getOpt('webSearchMode');
        if (getOpt('webSearchQueryCount') !== undefined) result.queryCount = getOpt('webSearchQueryCount');
        if (getOpt('webSearchMaxPages') !== undefined) result.maxPages = getOpt('webSearchMaxPages');
        if (getOpt('webSearchDedupeStrategy')) result.dedupeStrategy = getOpt('webSearchDedupeStrategy');
        if (getOpt('webSearchGl')) result.gl = getOpt('webSearchGl');
        if (getOpt('webSearchHl')) result.hl = getOpt('webSearchHl');

        // Build nested model objects matching library schema exactly
        const qModel = getOpt('webSearchQueryModel');
        if (queryPrompt || qModel) {
            result.queryModel = {};
            if (qModel) result.queryModel.model = qModel;
            if (queryPrompt) result.queryModel.prompt = queryPrompt;
        }

        const sModel = getOpt('webSearchSelectModel');
        if (selectPrompt || sModel) {
            result.selectModel = {};
            if (sModel) result.selectModel.model = sModel;
            if (selectPrompt) result.selectModel.prompt = selectPrompt;
        }

        const cModel = getOpt('webSearchCompressModel');
        const cPrompt = getOpt('webSearchCompressPrompt');
        if (cPrompt || cModel) {
            result.compressModel = {};
            if (cModel) result.compressModel.model = cModel;
            if (cPrompt) result.compressModel.prompt = cPrompt;
        }

        // Output config
        const outputMode = getOpt('webSearchOutputMode');
        const outputColumn = getOpt('webSearchOutputColumn');
        const outputExplode = getOpt('webSearchOutputExplode');
        if (outputMode || outputColumn || outputExplode) {
            result.output = {};
            if (outputMode) result.output.mode = outputMode;
            if (outputColumn) result.output.column = outputColumn;
            if (outputExplode) result.output.explode = true;
        }

        return result;
    }
}
