import { BasePluginRow, PluginResult, PluginItem } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { ImageSearchConfig } from './ImageSearchPlugin.js';
import { AiImageSearch } from './AiImageSearch.js';
import { LlmListSelector } from '../../utils/LlmListSelector.js';
import { ImageSearch } from './ImageSearch.js';

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

        const queryLlm = config.queryModel ? await stepRow.createLlm(config.queryModel) : undefined;
        const selectLlm = config.selectModel ? await stepRow.createLlm(config.selectModel) : undefined;

        const selector = selectLlm ? new LlmListSelector(selectLlm) : undefined;

        const aiImageSearch = new AiImageSearch(this.imageSearch, queryLlm, selector);

        aiImageSearch.events.on('query:generated', (data) => {
            this.emitTmpArtifact({
                type: 'json',
                filename: `imageSearch/queries/queries_${Date.now()}.json`,
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'imageSearch', 'queries']
            });
        });

        aiImageSearch.events.on('search:result', (data) => {
            const safeQuery = data.query.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            this.emitTmpArtifact({
                type: 'json',
                filename: `imageSearch/scatter/scatter_${safeQuery}_p${data.page}_${Date.now()}.json`,
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'imageSearch', 'scatter']
            });
        });

        aiImageSearch.events.on('artifact:sprite', (data) => {
            this.emitTmpArtifact({
                type: 'image',
                filename: `imageSearch/sprites/sprite_${data.index}_${Date.now()}.jpg`,
                content: data.buffer,
                tags: ['debug', 'imageSearch', 'sprite']
            });
        });

        aiImageSearch.events.on('artifact:candidate', (data) => {
            this.emitTmpArtifact({
                type: 'image',
                filename: `imageSearch/candidates/candidate_${data.index}_${Date.now()}.jpg`,
                content: data.buffer,
                tags: ['debug', 'imageSearch', 'candidate']
            });
        });

        aiImageSearch.events.on('result:selected', (data) => {
            // Emit JSON metadata
            this.emitTmpArtifact({
                type: 'json',
                filename: `imageSearch/selected/selected_${Date.now()}.json`,
                content: JSON.stringify(data.results.map((r: any) => r.metadata), null, 2),
                tags: ['final', 'imageSearch', 'selected']
            });

            // Emit actual selected images
            data.results.forEach((r: any, i: number) => {
                const { ext } = getImageFormat(r.buffer);
                this.emitArtifact({
                    type: 'image',
                    filename: `imageSearch/selected/image_${i}_${Date.now()}.${ext}`,
                    content: r.buffer,
                    tags: ['final', 'imageSearch', 'selected', 'image'],
                    metadata: r.metadata,
                    index: i,
                    total: data.results.length,
                    artifactName: `image_${i}`,
                    extension: ext
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
            hl: config.hl,
            tbs: config.tbs
        });

        const history = await stepRow.getPreparedMessages();

        const items: PluginItem[] = result.map((searchResult) => {
            const base64 = searchResult.buffer.toString('base64');
            const { mimeType } = getImageFormat(searchResult.buffer);
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

function getImageFormat(buffer: Buffer): { ext: string; mimeType: string } {
    if (buffer.length >= 12
        && buffer.toString('ascii', 0, 4) === 'RIFF'
        && buffer.toString('ascii', 8, 12) === 'WEBP') {
        return { ext: 'webp', mimeType: 'image/webp' };
    }

    if (buffer.length >= 8
        && buffer[0] === 0x89
        && buffer[1] === 0x50
        && buffer[2] === 0x4e
        && buffer[3] === 0x47) {
        return { ext: 'png', mimeType: 'image/png' };
    }

    if (buffer.length >= 3
        && buffer[0] === 0xff
        && buffer[1] === 0xd8
        && buffer[2] === 0xff) {
        return { ext: 'jpg', mimeType: 'image/jpeg' };
    }

    if (buffer.length >= 6
        && (buffer.toString('ascii', 0, 6) === 'GIF87a'
            || buffer.toString('ascii', 0, 6) === 'GIF89a')) {
        return { ext: 'gif', mimeType: 'image/gif' };
    }

    return { ext: 'jpg', mimeType: 'image/jpeg' };
}
