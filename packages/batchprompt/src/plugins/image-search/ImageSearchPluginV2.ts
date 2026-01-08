import { z } from 'zod';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import {
    Plugin,
    LlmFactory
} from '../types.js';
import { Step } from '../../core/Step.js';
import { StepRow } from '../../core/StepRow.js';
import { ServiceCapabilities, ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, BaseModelConfigSchema, DEFAULT_PLUGIN_OUTPUT } from '../../config/schemas/index.js';
import { PromptLoader } from '../../config/PromptLoader.js';
import { AiImageSearch } from './AiImageSearch.js';
import { LlmListSelector } from '../../utils/LlmListSelector.js';
import { ImageSearch } from './ImageSearch.js';

// =============================================================================
// Config Schema
// =============================================================================

export const ImageSearchConfigSchemaV2 = z.object({
    type: z.literal('image-search').describe("Identifies this as an Image Search plugin."),
    id: z.string().optional().describe("Unique ID for this plugin instance."),
    output: OutputConfigSchema.default(DEFAULT_PLUGIN_OUTPUT).describe("How to save the image results."),

    // Query source - at least one required
    query: z.string().optional().describe("Static image search query. Supports Handlebars."),
    queryModel: BaseModelConfigSchema.optional().describe("Model configuration for generating search queries."),

    // Selection
    selectModel: BaseModelConfigSchema.optional().describe("Model configuration for selecting the best images."),

    // Search options
    limit: z.number().int().positive().default(12).describe("Images to fetch per query."),
    select: z.number().int().positive().default(1).describe("Number of images to select/keep."),
    queryCount: z.number().int().positive().default(3).describe("Number of queries to generate."),
    spriteSize: z.number().int().positive().default(4).describe("Number of images to stitch into a sprite for selection."),
    maxPages: z.number().int().positive().default(1).describe("Max pages of results to fetch per query."),
    dedupeStrategy: z.enum(['none', 'domain', 'url']).default('url').describe("Deduplication strategy."),
    gl: z.string().optional().describe("Country code."),
    hl: z.string().optional().describe("Language code.")
}).strict().refine(
    (data) => data.query !== undefined || data.queryModel?.prompt !== undefined,
    {
        message: "image-search requires either 'query' or 'queryModel.prompt' to know what to search for."
    }
).describe("Configuration for the Image Search plugin.");

export type ImageSearchRawConfigV2 = z.infer<typeof ImageSearchConfigSchemaV2>;

export interface ImageSearchResolvedConfigV2 {
    type: 'image-search';
    id: string;
    output: ResolvedOutputConfig;
    query?: string;
    queryModel?: ResolvedModelConfig;
    selectModel?: ResolvedModelConfig;
    limit: number;
    select: number;
    queryCount: number;
    spriteSize: number;
    maxPages: number;
    dedupeStrategy: 'none' | 'domain' | 'url';
    gl?: string;
    hl?: string;
}

// =============================================================================
// Plugin
// =============================================================================

export class ImageSearchPluginV2 implements Plugin<ImageSearchRawConfigV2, ImageSearchResolvedConfigV2> {
    readonly type = 'image-search';
    readonly configSchema = ImageSearchConfigSchemaV2;

    constructor(
        private deps: {
            promptLoader: PromptLoader;
            imageSearch: ImageSearch;
            createLlm: LlmFactory;
        }
    ) {}

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return ['hasSerper'];
    }

    private async resolvePluginModel(
        step: Step,
        config: z.infer<typeof BaseModelConfigSchema> | undefined
    ): Promise<ResolvedModelConfig | undefined> {
        if (!config?.prompt) return undefined;

        const promptParts = await step.loadPrompt(config.prompt);
        const systemParts = config.system ? await step.loadPrompt(config.system) : [];

        return {
            model: config.model,
            temperature: config.temperature,
            thinkingLevel: config.thinkingLevel,
            systemParts,
            promptParts
        };
    }

    async init(step: Step, rawConfig: ImageSearchRawConfigV2): Promise<ImageSearchResolvedConfigV2> {
        return {
            type: 'image-search',
            id: rawConfig.id ?? `image-search-${Date.now()}`,
            output: {
                mode: rawConfig.output.mode,
                column: rawConfig.output.column,
                explode: rawConfig.output.explode
            },
            query: rawConfig.query,
            queryModel: await this.resolvePluginModel(step, rawConfig.queryModel),
            selectModel: await this.resolvePluginModel(step, rawConfig.selectModel),
            limit: rawConfig.limit,
            select: rawConfig.select,
            queryCount: rawConfig.queryCount,
            spriteSize: rawConfig.spriteSize,
            maxPages: rawConfig.maxPages,
            dedupeStrategy: rawConfig.dedupeStrategy,
            gl: rawConfig.gl,
            hl: rawConfig.hl
        };
    }

    async prepare(stepRow: StepRow, config: ImageSearchResolvedConfigV2): Promise<void> {
        const { context } = stepRow;
        const emit = stepRow.step.globalContext.events.emit.bind(stepRow.step.globalContext.events);
        const imageSearch = this.deps.imageSearch;

        // Render query
        let query: string | undefined;
        if (config.query) {
            query = stepRow.render(config.query);
        }

        // Create LLM clients
        const queryLlm = config.queryModel ? stepRow.createLlm(config.queryModel) : undefined;
        const selectLlm = config.selectModel ? stepRow.createLlm(config.selectModel) : undefined;

        // Create Selector
        const selector = selectLlm ? new LlmListSelector(selectLlm) : undefined;

        // Use AiImageSearch utility
        const aiImageSearch = new AiImageSearch(imageSearch, queryLlm, selector, config.spriteSize);

        // Wire up events
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
            query,
            limit: config.select,
            queryCount: config.queryCount,
            maxPages: config.maxPages,
            dedupeStrategy: config.dedupeStrategy,
            gl: config.gl,
            hl: config.hl
        });

        if (selectedImages.length === 0) {
            return;
        }

        // Process final images in parallel
        const sharp = (await import('sharp')).default;
        const baseName = stepRow.outputBasename || 'image';

        const processedPackets = await Promise.all(selectedImages.map(async (img, i) => {
            const filename = `image_search/selected/${baseName}_selected_${i}.jpg`;

            try {
                const processed = await sharp(img.buffer)
                    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 80 })
                    .toBuffer();

                // Emit final artifact
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
                const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{
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

        const validPackets = processedPackets.filter((p): p is { data: any, contentParts: any[] } => p !== null);

        // Append content to prompt
        for (const packet of validPackets) {
            stepRow.appendContent(packet.contentParts);
        }

        // Store results for postProcess
        stepRow.context._imageSearch_results = validPackets.map(p => p.data);
    }

    async postProcess(stepRow: StepRow, config: ImageSearchResolvedConfigV2, modelResult: any): Promise<any> {
        const results = stepRow.context._imageSearch_results;
        if (results && (modelResult === null || modelResult === undefined)) {
            return results;
        }
        return modelResult;
    }
}
