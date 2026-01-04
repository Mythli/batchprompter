import { z } from 'zod';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import {
    Plugin,
    PluginExecutionContext,
    PluginResult
} from '../types.js';
import { ServiceCapabilities, ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, PromptDefSchema } from '../../config/common.js';
import { PromptLoader } from '../../config/PromptLoader.js';
import { AiImageSearch } from '../../utils/AiImageSearch.js';
import { LlmListSelector } from '../../utils/LlmListSelector.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';

// =============================================================================
// Config Schema (Single source of truth for defaults)
// =============================================================================

export const ImageSearchConfigSchemaV2 = z.object({
    type: z.literal('image-search').describe("Identifies this as an Image Search plugin."),
    id: z.string().optional().describe("Unique ID for this plugin instance."),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }).describe("How to save the image results."),
    query: z.string().optional().describe("Static image search query. Supports Handlebars."),

    // Query model config
    queryModel: z.string().optional().describe("Model used to generate search queries."),
    queryTemperature: z.number().min(0).max(2).optional().describe("Temperature for query generation."),
    queryThinkingLevel: z.enum(['low', 'medium', 'high']).optional().describe("Thinking level for query generation."),
    queryPrompt: PromptDefSchema.optional().describe("Instructions for generating search queries."),
    querySystem: PromptDefSchema.optional().describe("System prompt for query generation."),

    // Select model config
    selectModel: z.string().optional().describe("Model used to select the best images."),
    selectTemperature: z.number().min(0).max(2).optional().describe("Temperature for selection."),
    selectThinkingLevel: z.enum(['low', 'medium', 'high']).optional().describe("Thinking level for selection."),
    selectPrompt: PromptDefSchema.optional().describe("Criteria for selecting images (e.g., scoring rubric)."),
    selectSystem: PromptDefSchema.optional().describe("System prompt for selection."),

    // Search options
    limit: z.number().int().positive().default(12).describe("Images to fetch per query."),
    select: z.number().int().positive().default(1).describe("Number of images to select/keep."),
    queryCount: z.number().int().positive().default(3).describe("Number of queries to generate."),
    spriteSize: z.number().int().positive().default(4).describe("Number of images to stitch into a sprite for selection."),
    maxPages: z.number().int().positive().default(1).describe("Max pages of results to fetch per query."),
    dedupeStrategy: z.enum(['none', 'domain', 'url']).default('url').describe("Deduplication strategy."),
    gl: z.string().optional().describe("Country code."),
    hl: z.string().optional().describe("Language code.")
}).describe("Configuration for the Image Search plugin.");

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

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return ['hasSerper'];
    }

    async resolveConfig(
        rawConfig: ImageSearchRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' },
        contentResolver: ContentResolver
    ): Promise<ImageSearchResolvedConfigV2> {
        const promptLoader = new PromptLoader(contentResolver);

        const resolvePrompt = async (
            prompt: any,
            modelOverride?: string,
            temperatureOverride?: number,
            thinkingLevelOverride?: 'low' | 'medium' | 'high'
        ): Promise<ResolvedModelConfig | undefined> => {
            if (!prompt) return undefined;
            const parts = await promptLoader.load(prompt);
            const renderedParts = parts.map(part => {
                if (part.type === 'text') {
                    const template = Handlebars.compile(part.text, { noEscape: true });
                    return { type: 'text' as const, text: template(row) };
                }
                return part;
            });
            return {
                model: modelOverride || inheritedModel.model,
                temperature: temperatureOverride ?? inheritedModel.temperature,
                thinkingLevel: thinkingLevelOverride ?? inheritedModel.thinkingLevel,
                systemParts: [],
                promptParts: renderedParts
            };
        };

        let query: string | undefined;
        if (rawConfig.query) {
            const template = Handlebars.compile(rawConfig.query, { noEscape: true });
            query = template(row);
        }

        return {
            type: 'image-search',
            id: rawConfig.id ?? `image-search-${Date.now()}`,
            output: {
                mode: rawConfig.output.mode,
                column: rawConfig.output.column,
                explode: rawConfig.output.explode
            },
            query,
            queryModel: await resolvePrompt(
                rawConfig.queryPrompt,
                rawConfig.queryModel,
                rawConfig.queryTemperature,
                rawConfig.queryThinkingLevel
            ),
            selectModel: await resolvePrompt(
                rawConfig.selectPrompt,
                rawConfig.selectModel,
                rawConfig.selectTemperature,
                rawConfig.selectThinkingLevel
            ),
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

    async execute(
        config: ImageSearchResolvedConfigV2,
        context: PluginExecutionContext
    ): Promise<PluginResult> {
        const { services, row, outputBasename, emit } = context;
        const imageSearch = services.imageSearch;

        if (!imageSearch) {
            throw new Error('[ImageSearch] ImageSearch service not available');
        }

        // Create LLM clients
        const queryLlm = config.queryModel ? services.createLlm(config.queryModel) : undefined;
        const selectLlm = config.selectModel ? services.createLlm(config.selectModel) : undefined;

        // Create Selector
        const selector = selectLlm ? new LlmListSelector(selectLlm) : undefined;

        // Use AiImageSearch utility for Map-Reduce execution
        const aiImageSearch = new AiImageSearch(imageSearch, queryLlm, selector, config.spriteSize);

        // Wire up events
        aiImageSearch.events.on('search:result', (data) => {
            const safeQuery = data.query.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            emit('plugin:artifact', {
                row: context.row.index,
                step: context.stepIndex,
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
                row: context.row.index,
                step: context.stepIndex,
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
                row: context.row.index,
                step: context.stepIndex,
                plugin: 'image-search',
                type: 'image',
                filename,
                content: data.buffer,
                tags: ['debug', 'image-search', 'candidate']
            });
        });

        aiImageSearch.events.on('query:generated', (data) => {
            emit('plugin:artifact', {
                row: context.row.index,
                step: context.stepIndex,
                plugin: 'image-search',
                type: 'json',
                filename: `image_search/search_results/queries_${Date.now()}.json`,
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'image-search', 'queries']
            });
        });

        const selectedImages = await aiImageSearch.process(row, {
            query: config.query,
            limit: config.select, // We want 'select' number of final images
            queryCount: config.queryCount,
            maxPages: config.maxPages,
            dedupeStrategy: config.dedupeStrategy,
            gl: config.gl,
            hl: config.hl
        });

        if (selectedImages.length === 0) {
            return { packets: [] };
        }

        // Build packets
        const packets: any[] = [];
        const sharp = (await import('sharp')).default;
        const baseName = outputBasename || 'image';

        // Process final images in parallel
        await Promise.all(selectedImages.map(async (img, i) => {
            const filename = `image_search/selected/${baseName}_selected_${i}.jpg`;

            try {
                const processed = await sharp(img.buffer)
                    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 80 })
                    .toBuffer();

                // Emit final artifact
                emit('plugin:artifact', {
                    row: context.row.index,
                    step: context.stepIndex,
                    plugin: 'image-search',
                    type: 'image',
                    filename,
                    content: processed,
                    tags: ['final', 'image-search', 'selected']
                });

                const base64 = processed.toString('base64');
                const contentPart: OpenAI.Chat.Completions.ChatCompletionContentPart = {
                    type: 'image_url',
                    image_url: { url: `data:image/jpeg;base64,${base64}` }
                };

                packets.push({
                    data: {
                        ...img.metadata,
                        // Note: localPath is no longer available directly here as we don't know where the handler saved it.
                        // If downstream needs it, we might need to coordinate or assume standard path.
                        // For now, we omit localPath or provide a relative hint.
                        filename,
                        searchIndex: i + 1
                    },
                    contentParts: [contentPart]
                });
            } catch (e) {
                console.warn(`[ImageSearch] Failed to process image:`, e);
            }
        }));

        return { packets };
    }
}
