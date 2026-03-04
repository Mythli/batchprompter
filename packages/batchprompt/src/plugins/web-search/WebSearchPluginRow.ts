import { BasePluginRow, PluginResult, PluginItem } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { WebSearchConfig } from './WebSearchPlugin.js';
import { AiWebSearch } from './AiWebSearch.js';
import { LlmListSelector } from '../../utils/LlmListSelector.js';
import { WebSearch } from './WebSearch.js';

export class WebSearchPluginRow extends BasePluginRow<WebSearchConfig> {
    constructor(
        stepRow: StepRow,
        config: WebSearchConfig,
        private webSearch: WebSearch,
        private scrapedCache: Set<string>
    ) {
        super(stepRow, config);
    }

    async prepare(): Promise<PluginResult> {
        const { stepRow, config } = this;
        const { context } = stepRow;
        const emit = stepRow.step.deps.events.emit.bind(stepRow.step.deps.events);

        const queryLlm = config.queryModel ? await stepRow.createLlm(config.queryModel) : undefined;
        const selectLlm = config.selectModel ? await stepRow.createLlm(config.selectModel) : undefined;
        const compressLlm = config.compressModel ? await stepRow.createLlm(config.compressModel) : undefined;

        const selector = selectLlm ? new LlmListSelector(selectLlm) : undefined;

        const aiWebSearch = new AiWebSearch(this.webSearch, queryLlm, selector, compressLlm);

        aiWebSearch.events.on('query:generated', (data) => {
            emit('artifact:emit', {
                row: context.index,
                step: stepRow.step.stepIndex,
                source: 'webSearch',
                type: 'json',
                filename: `webSearch/queries/queries_${Date.now()}.json`,
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'webSearch', 'queries']
            });
        });

        aiWebSearch.events.on('search:result', (data) => {
            const safeQuery = data.query.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            emit('artifact:emit', {
                row: context.index,
                step: stepRow.step.stepIndex,
                source: 'webSearch',
                type: 'json',
                filename: `webSearch/scatter/scatter_${safeQuery}_p${data.page}_${Date.now()}.json`,
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'webSearch', 'scatter']
            });
        });

        aiWebSearch.events.on('selection:map', (data) => {
            emit('artifact:emit', {
                row: context.index,
                step: stepRow.step.stepIndex,
                source: 'webSearch',
                type: 'json',
                filename: `webSearch/map/map_chunk${data.chunkIndex}_${Date.now()}.json`,
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'webSearch', 'map']
            });
        });

        aiWebSearch.events.on('selection:reduce', (data) => {
            emit('artifact:emit', {
                row: context.index,
                step: stepRow.step.stepIndex,
                source: 'webSearch',
                type: 'json',
                filename: `webSearch/reduce/reduce_${Date.now()}.json`,
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'webSearch', 'reduce']
            });
        });

        aiWebSearch.events.on('content:enrich', (data) => {
            const safeUrl = data.url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            emit('artifact:emit', {
                row: context.index,
                step: stepRow.step.stepIndex,
                source: 'webSearch',
                type: 'json',
                filename: `webSearch/enrich/enrich_${safeUrl}_${Date.now()}.json`,
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'webSearch', 'enrich']
            });
        });

        aiWebSearch.events.on('result:selected', (data) => {
            emit('artifact:emit', {
                row: context.index,
                step: stepRow.step.stepIndex,
                source: 'webSearch',
                type: 'json',
                filename: `webSearch/selected/selected_${Date.now()}.json`,
                content: JSON.stringify(data.results, null, 2),
                tags: ['final', 'webSearch', 'selected']
            });
        });

        const result = await aiWebSearch.process(context, {
            query: config.query,
            limit: config.limit,
            chunkSize: config.chunkSize,
            mode: config.mode,
            queryCount: config.queryCount,
            maxPages: config.maxPages,
            dedupeStrategy: config.dedupeStrategy,
            gl: config.gl,
            hl: config.hl,
            scrapedCache: this.scrapedCache
        });

        const history = await stepRow.getPreparedMessages();

        // Build items: each search result becomes a separate item
        // This allows proper explosion with matched data + content
        const items: PluginItem[] = result.data.map((searchResult, idx) => {
            // Build content parts specific to this result
            const contentText = `Source: ${searchResult.title} (${searchResult.link})\nContent:\n${searchResult.content || searchResult.snippet || ''}`;
            return {
                data: searchResult,
                contentParts: [{ type: 'text' as const, text: `\n--- Web Search Result ---\n${contentText}\n--------------------------\n` }]
            };
        });

        // If no results, return single item with empty data
        if (items.length === 0) {
            return {
                history,
                items: [{ data: null, contentParts: [{ type: 'text', text: 'No search results found.' }] }]
            };
        }

        return {
            history,
            items
        };
    }
}
