import { z } from 'zod';
import Handlebars from 'handlebars';
import {
    BasePlugin,
    LlmFactory,
    PluginPacket
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { OutputConfigSchema, RawModelConfigSchema, DEFAULT_PLUGIN_OUTPUT, resolveModelConfig } from '../../config/schemas/index.js';
import { AiImageSearch } from './AiImageSearch.js';
import { LlmListSelector } from '../../utils/LlmListSelector.js';
import { ImageSearch } from './ImageSearch.js';
import { StepBaseConfig, GlobalsConfig } from '../../config/schema.js';

export const ImageSearchConfigSchemaV2 = z.object({
    type: z.literal('image-search'),
    id: z.string().optional(),
    output: OutputConfigSchema.default(DEFAULT_PLUGIN_OUTPUT),
    query: z.string().optional(),
    queryModel: RawModelConfigSchema.optional(),
    selectModel: RawModelConfigSchema.optional(),
    limit: z.number().int().positive().default(12),
    select: z.number().int().positive().default(1),
    queryCount: z.number().int().positive().default(3),
    spriteSize: z.number().int().positive().default(4),
    maxPages: z.number().int().positive().default(1),
    dedupeStrategy: z.enum(['none', 'domain', 'url']).default('url'),
    gl: z.string().optional(),
    hl: z.string().optional()
}).strict();

export type ImageSearchConfig = z.output<typeof ImageSearchConfigSchemaV2>;

export class ImageSearchPluginV2 extends BasePlugin<ImageSearchConfig> {
    readonly type = 'image-search';

    constructor(
        private deps: {
            imageSearch: ImageSearch;
            createLlm: LlmFactory;
        }
    ) {
        super();
    }

    getSchema(step: StepBaseConfig, globals: GlobalsConfig) {
        return ImageSearchConfigSchemaV2.transform(config => {
            return {
                ...config,
                id: config.id ?? `image-search-${Date.now()}`,
                queryModel: config.queryModel ? resolveModelConfig(config.queryModel, step.model) : undefined,
                selectModel: config.selectModel ? resolveModelConfig(config.selectModel, step.model) : undefined,
            };
        });
    }

    async hydrate(config: ImageSearchConfig, context: Record<string, any>): Promise<ImageSearchConfig> {
        let query: string | undefined;
        if (config.query) {
            const template = Handlebars.compile(config.query, { noEscape: true });
            query = template(context);
        }

        return {
            ...config,
            query
        };
    }

    async prepare(stepRow: StepRow, config: ImageSearchConfig): Promise<PluginPacket[]> {
        const { context } = stepRow;
        const emit = stepRow.step.globalContext.events.emit.bind(stepRow.step.globalContext.events);
        const imageSearch = this.deps.imageSearch;

        const queryLlm = config.queryModel ? await stepRow.createLlm(config.queryModel) : undefined;
        const selectLlm = config.selectModel ? await stepRow.createLlm(config.selectModel) : undefined;

        const selector = selectLlm ? new LlmListSelector(selectLlm) : undefined;

        const aiImageSearch = new AiImageSearch(imageSearch, queryLlm, selector, config.spriteSize);

        aiImageSearch.events.on('search:result', (data) => {
            const safeQuery = data.query.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            emit('plugin:artifact', {
                row: context.index,
                step: stepRow.step.stepIndex,
                plugin: 'image-search',
                type: 'json',
                filename: `image_search/search_results/result_task${data.taskIndex}_${safeQuery}_p${data.page}.json`,
                content: JSON.stringify(data.results, null, 2),
                tags: ['debug', 'image-search', 'search-result']
            });
        });

        aiImageSearch.events.on('artifact:sprite', (data) => {
            let filename = `image_search/sprites/sprite_${data.phase}`;
            if (data.taskIndex !== undefined) filename += `_task${data.taskIndex}`;
            filename += `_${data.index}.jpg`;

            emit('plugin:artifact', {
                row: context.index,
                step: stepRow.step.stepIndex,
                plugin: 'image-search',
                type: 'image',
                filename,
                content: data.buffer,
                tags: ['debug', 'image-search', 'sprite']
            });
        });

        aiImageSearch.events.on('artifact:candidate', (data) => {
            let filename = `image_search/candidates/candidate_${data.phase}`;
            if (data.taskIndex !== undefined) filename += `_task${data.taskIndex}`;
            filename += `_${data.index}.jpg`;

            emit('plugin:artifact', {
                row: context.index,
                step: stepRow.step.stepIndex,
                plugin: 'image-search',
                type: 'image',
                filename,
                content: data.buffer,
                tags: ['debug', 'image-search', 'candidate']
            });
        });

        aiImageSearch.events.on('query:generated', (data) => {
            emit('plugin:artifact', {
                row: context.index,
                step: stepRow.step.stepIndex,
                plugin: 'image-search',
                type: 'json',
                filename: `image_search/search_results/queries_${Date.now()}.json`,
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'image-search', 'queries']
            });
        });

        const selectedImages = await aiImageSearch.process(context, {
            query: config.query,
            limit: config.select,
            queryCount: config.queryCount,
            maxPages: config.maxPages,
            dedupeStrategy: config.dedupeStrategy,
            gl: config.gl,
            hl: config.hl
        });

        if (selectedImages.length === 0) {
            return [{ data: [null], contentParts: [] }];
        }

        const sharp = (await import('sharp')).default;
        const baseName = (await stepRow.getOutputBasename()) || 'image';

        const processedPackets = await Promise.all(selectedImages.map(async (img, i) => {
            const filename = `image_search/selected/${baseName}_selected_${i}.jpg`;

            try {
                const processed = await sharp(img.buffer)
                    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 80 })
                    .toBuffer();

                emit('plugin:artifact', {
                    row: context.index,
                    step: stepRow.step.stepIndex,
                    plugin: 'image-search',
                    type: 'image',
                    filename,
                    content: processed,
                    tags: ['final', 'image-search', 'selected']
                });

                const base64 = processed.toString('base64');
                const contentParts = [{
                    type: 'image_url',
                    image_url: { url: `data:image/jpeg;base64,${base64}` }
                }];

                return {
                    data: img.metadata,
                    contentParts
                };

            } catch (e) {
                console.warn(`[ImageSearch] Failed to process image:`, e);
                return null;
            }
        }));

        const validItems = processedPackets.filter((p): p is { data: any, contentParts: any[] } => p !== null);

        return [{
            data: validItems.map(p => p.data),
            contentParts: validItems.flatMap(p => p.contentParts)
        }];
    }
}
