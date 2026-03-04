import { BasePluginRow, PluginResult, PluginItem } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { ImageSearchConfig } from './ImageSearchPlugin.js';
import { AiImageSearch } from './AiImageSearch.js';
import { LlmListSelector } from '../../utils/LlmListSelector.js';
import { ImageSearch } from './ImageSearch.js';
import * as path from 'path';

export class ImageSearchPluginRow extends BasePluginRow<ImageSearchConfig> {
    constructor(
        stepRow: StepRow,
        config: ImageSearchConfig,
        private imageSearch: ImageSearch
    ) {
        super(stepRow, config);
    }

    async prepare(): Promise<PluginResult> {
        const { stepRow, config } = this;
        const { context } = stepRow;
        const emit = stepRow.step.deps.events.emit.bind(stepRow.step.deps.events);
        const tmpDir = await stepRow.getTempDir();

        const queryLlm = config.queryModel ? await stepRow.createLlm(config.queryModel) : undefined;
        const selectLlm = config.selectModel ? await stepRow.createLlm(config.selectModel) : undefined;

        const selector = selectLlm ? new LlmListSelector(selectLlm) : undefined;

        const aiImageSearch = new AiImageSearch(this.imageSearch, queryLlm, selector);

        aiImageSearch.events.on('query:generated', (data) => {
            emit('artifact:emit', {
                row: stepRow.getOriginalIndex(),
                step: stepRow.step.stepIndex,
                source: 'imageSearch',
                type: 'json',
                filename: path.join(tmpDir, `imageSearch/queries/queries_${Date.now()}.json`),
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'imageSearch', 'queries']
            });
        });

        aiImageSearch.events.on('search:result', (data) => {
            const safeQuery = data.query.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            emit('artifact:emit', {
                row: stepRow.getOriginalIndex(),
                step: stepRow.step.stepIndex,
                source: 'imageSearch',
                type: 'json',
                filename: path.join(tmpDir, `imageSearch/scatter/scatter_${safeQuery}_p${data.page}_${Date.now()}.json`),
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'imageSearch', 'scatter']
            });
        });

        aiImageSearch.events.on('artifact:sprite', (data) => {
            emit('artifact:emit', {
                row: stepRow.getOriginalIndex(),
                step: stepRow.step.stepIndex,
                source: 'imageSearch',
                type: 'image',
                filename: path.join(tmpDir, `imageSearch/sprites/sprite_${data.index}_${Date.now()}.jpg`),
                content: data.buffer,
                tags: ['debug', 'imageSearch', 'sprite']
            });
        });

        aiImageSearch.events.on('artifact:candidate', (data) => {
            emit('artifact:emit', {
                row: stepRow.getOriginalIndex(),
                step: stepRow.step.stepIndex,
                source: 'imageSearch',
                type: 'image',
                filename: path.join(tmpDir, `imageSearch/candidates/candidate_${data.index}_${Date.now()}.jpg`),
                content: data.buffer,
                tags: ['debug', 'imageSearch', 'candidate']
            });
        });

        aiImageSearch.events.on('result:selected', (data) => {
            // Emit JSON metadata
            emit('artifact:emit', {
                row: stepRow.getOriginalIndex(),
                step: stepRow.step.stepIndex,
                source: 'imageSearch',
                type: 'json',
                filename: path.join(tmpDir, `imageSearch/selected/selected_${Date.now()}.json`),
                content: JSON.stringify(data.results.map((r: any) => r.metadata), null, 2),
                tags: ['final', 'imageSearch', 'selected']
            });

            // Emit actual selected images
            data.results.forEach((r: any, i: number) => {
                const ext = r.metadata.imageUrl.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
                emit('artifact:emit', {
                    row: stepRow.getOriginalIndex(),
                    step: stepRow.step.stepIndex,
                    source: 'imageSearch',
                    type: 'image',
                    filename: path.join(tmpDir, `imageSearch/selected/image_${i}_${Date.now()}.${ext}`),
                    content: r.buffer,
                    tags: ['final', 'imageSearch', 'selected', 'image']
                });
            });
        });

        const result = await aiImageSearch.process(context, {
            query: config.query,
            limit: config.limit,
            queryCount: config.queryCount,
            maxPages: config.maxPages,
            dedupeStrategy: config.dedupeStrategy,
            gl: config.gl,
            hl: config.hl
        });

        const history = await stepRow.getPreparedMessages();

        const items: PluginItem[] = result.map((searchResult) => {
            const base64 = searchResult.buffer.toString('base64');
            const mimeType = searchResult.metadata.imageUrl.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
            const dataUrl = `data:${mimeType};base64,${base64}`;

            return {
                data: searchResult.metadata,
                contentParts: [
                    { type: 'text' as const, text: `\n--- Image Search Result ---\nTitle: ${searchResult.metadata.title}\nSource: ${searchResult.metadata.source}\n` },
                    { type: 'image_url' as const, image_url: { url: dataUrl } }
                ]
            };
        });

        if (items.length === 0) {
            return {
                history,
                items: [{ data: null, contentParts: [{ type: 'text', text: 'No image search results found.' }] }]
            };
        }

        return {
            history,
            items
        };
    }
}
