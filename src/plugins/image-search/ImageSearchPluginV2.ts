import { z } from 'zod';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import path from 'path';
import {
    Plugin,
    PluginExecutionContext,
    PluginResult,
    CLIOptionDefinition
} from '../types.js';
import { ServiceCapabilities, ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, PromptDefSchema } from '../../config/schema.js';
import { PromptLoader } from '../../config/PromptLoader.js';
import { DEFAULT_OUTPUT } from '../../config/defaults.js';
import { SpriteGenerator } from '../../utils/SpriteGenerator.js';
import { ArtifactSaver } from '../../ArtifactSaver.js';
import { ensureDir } from '../../utils/fileUtils.js';
import { ModelFlags } from '../../cli/ModelFlags.js';

// =============================================================================
// Config Schema (Single source of truth for defaults)
// =============================================================================

export const ImageSearchConfigSchemaV2 = z.object({
    type: z.literal('image-search'),
    id: z.string().optional(),
    output: OutputConfigSchema.optional(),
    query: z.string().optional(),
    // Query model config
    queryPrompt: PromptDefSchema.optional(),
    queryModel: z.string().optional(),
    queryTemperature: z.number().optional(),
    queryThinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    // Select model config
    selectPrompt: PromptDefSchema.optional(),
    selectModel: z.string().optional(),
    selectTemperature: z.number().optional(),
    selectThinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    // Search options
    limit: z.number().int().positive().default(12),
    select: z.number().int().positive().default(1),
    queryCount: z.number().int().positive().default(3),
    spriteSize: z.number().int().positive().default(4),
    maxPages: z.number().int().positive().default(1),
    dedupeStrategy: z.enum(['none', 'domain', 'url']).default('url'),
    gl: z.string().optional(),
    hl: z.string().optional()
});

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

    private promptLoader = new PromptLoader();

    readonly cliOptions: CLIOptionDefinition[] = [
        // Query model options
        ...ModelFlags.getOptions('image-query', { includePrompt: true }),
        // Select model options
        ...ModelFlags.getOptions('image-select', { includePrompt: true }),
        // Search options
        { flags: '--image-search-query <text>', description: 'Static image search query' },
        { flags: '--image-search-limit <number>', description: 'Images per query (default: 12)', parser: parseInt },
        { flags: '--image-search-select <number>', description: 'Images to select (default: 1)', parser: parseInt },
        { flags: '--image-search-query-count <number>', description: 'Queries to generate (default: 3)', parser: parseInt },
        { flags: '--image-search-sprite-size <number>', description: 'Images per sprite (default: 4)', parser: parseInt },
        { flags: '--image-search-max-pages <number>', description: 'Max pages per query (default: 1)', parser: parseInt },
        { flags: '--image-search-dedupe-strategy <strategy>', description: 'Deduplication (default: url)' },
        { flags: '--image-search-gl <country>', description: 'Country code' },
        { flags: '--image-search-hl <lang>', description: 'Language code' },
        // Output options
        { flags: '--image-search-export', description: 'Merge results into row' },
        { flags: '--image-search-explode', description: 'Explode results' },
        { flags: '--image-search-output <column>', description: 'Save to column' }
    ];

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return ['hasSerper'];
    }

    parseCLIOptions(options: Record<string, any>, stepIndex: number): ImageSearchRawConfigV2 | null {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const query = getOpt('imageSearchQuery');
        const queryConfig = ModelFlags.extractPluginModel(options, 'imageQuery', stepIndex);
        const selectConfig = ModelFlags.extractPluginModel(options, 'imageSelect', stepIndex);

        // Only activate if query or queryPrompt or selectPrompt is provided
        if (!query && !queryConfig.prompt && !selectConfig.prompt) {
            return null;
        }

        const exportFlag = getOpt('imageSearchExport');
        const explodeFlag = getOpt('imageSearchExplode');
        const outputColumn = getOpt('imageSearchOutput');

        let outputMode: 'merge' | 'column' | 'ignore' = 'ignore';
        if (outputColumn) outputMode = 'column';
        else if (exportFlag) outputMode = 'merge';

        // Return raw config - Zod will apply defaults
        const rawConfig = {
            type: 'image-search' as const,
            query,
            // Query model
            queryPrompt: queryConfig.prompt,
            queryModel: queryConfig.model,
            queryTemperature: queryConfig.temperature,
            queryThinkingLevel: queryConfig.thinkingLevel,
            // Select model
            selectPrompt: selectConfig.prompt,
            selectModel: selectConfig.model,
            selectTemperature: selectConfig.temperature,
            selectThinkingLevel: selectConfig.thinkingLevel,
            // Search options
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

        // Parse through Zod to apply defaults
        return this.configSchema.parse(rawConfig);
    }

    async resolveConfig(
        rawConfig: ImageSearchRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
    ): Promise<ImageSearchResolvedConfigV2> {
        const resolvePrompt = async (
            prompt: any,
            modelOverride?: string,
            temperatureOverride?: number,
            thinkingLevelOverride?: 'low' | 'medium' | 'high'
        ): Promise<ResolvedModelConfig | undefined> => {
            if (!prompt) return undefined;
            const parts = await this.promptLoader.load(prompt);
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
                mode: rawConfig.output?.mode ?? DEFAULT_OUTPUT.mode,
                column: rawConfig.output?.column,
                explode: rawConfig.output?.explode ?? DEFAULT_OUTPUT.explode
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
        const { services, row, tempDirectory, outputBasename } = context;
        const imageSearch = services.imageSearch;

        if (!imageSearch) {
            throw new Error('[ImageSearch] ImageSearch service not available');
        }

        // Generate queries
        const queries: string[] = [];

        if (config.query) {
            queries.push(config.query);
        }

        if (config.queryModel) {
            console.log(`[ImageSearch] Generating search queries...`);
            const queryLlm = services.createLlm(config.queryModel);

            const QuerySchema = z.object({
                queries: z.array(z.string()).min(1).max(config.queryCount)
            });

            const response = await queryLlm.promptZod(QuerySchema);
            queries.push(...response.queries);
            console.log(`[ImageSearch] Generated queries: ${response.queries.join(', ')}`);
        }

        if (queries.length === 0) {
            return { packets: [] };
        }

        // Search and collect images
        const pooledImages: any[] = [];
        const seenKeys = new Set<string>();

        for (const q of queries) {
            for (let page = 1; page <= config.maxPages; page++) {
                try {
                    const results = await imageSearch.search(q, config.limit, page, config.gl, config.hl);
                    if (results.length === 0) break;

                    for (const img of results) {
                        let key = img.metadata.imageUrl;
                        if (config.dedupeStrategy === 'domain') {
                            key = img.metadata.domain || key;
                        }

                        if (config.dedupeStrategy !== 'none') {
                            if (seenKeys.has(key)) continue;
                            seenKeys.add(key);
                        }

                        pooledImages.push(img);
                    }
                } catch (e: any) {
                    console.warn(`[ImageSearch] Query "${q}" page ${page} failed:`, e.message);
                    break;
                }
            }
        }

        if (pooledImages.length === 0) {
            throw new Error('[ImageSearch] No images found');
        }

        // Setup directories
        const baseName = outputBasename || 'image';
        const rawDir = path.join(tempDirectory, 'raw');
        const spritesDir = path.join(tempDirectory, 'sprites');
        const selectedDir = path.join(tempDirectory, 'selected');

        await ensureDir(rawDir + '/x');
        await ensureDir(spritesDir + '/x');
        await ensureDir(selectedDir + '/x');

        // Save raw images
        await Promise.all(pooledImages.map(async (img, idx) => {
            const filename = `${baseName}_raw_${idx}.jpg`;
            const savePath = path.join(rawDir, filename);
            try {
                await ArtifactSaver.save(img.buffer, savePath);
            } catch {}
        }));

        // Select images
        let selectedImages: any[] = [];

        if (config.selectModel) {
            console.log(`[ImageSearch] AI selecting from ${pooledImages.length} images...`);

            // Generate sprites
            const chunks: any[][] = [];
            for (let i = 0; i < pooledImages.length; i += config.spriteSize) {
                chunks.push(pooledImages.slice(i, i + config.spriteSize));
            }

            const sprites = await Promise.all(chunks.map(async (chunk, i) => {
                const startNum = (i * config.spriteSize) + 1;
                try {
                    const result = await SpriteGenerator.generate(chunk, startNum);

                    // Save sprite
                    const filename = `${baseName}_sprite_${i}.jpg`;
                    const savePath = path.join(spritesDir, filename);
                    await ArtifactSaver.save(result.spriteBuffer, savePath);

                    return { ...result, startNum, chunk, success: true };
                } catch {
                    return { success: false, startNum, chunk, spriteBuffer: Buffer.alloc(0), validIndices: [] };
                }
            }));

            const validSprites = sprites.filter(s => s.success);

            if (validSprites.length === 0) {
                throw new Error('[ImageSearch] Failed to generate sprites');
            }

            // Build index map
            const indexMap = new Map<number, any>();
            const imageParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

            for (const sprite of validSprites) {
                const base64 = sprite.spriteBuffer.toString('base64');
                imageParts.push({
                    type: 'image_url',
                    image_url: { url: `data:image/jpeg;base64,${base64}` }
                });

                sprite.validIndices.forEach((origIdx, i) => {
                    const visualIndex = sprite.startNum + i;
                    indexMap.set(visualIndex, sprite.chunk[origIdx]);
                });
            }

            // Ask LLM to select
            const selectLlm = services.createLlm(config.selectModel);

            const SelectionSchema = z.object({
                selected_indices: z.array(z.number()),
                reasoning: z.string()
            });

            const preamble: OpenAI.Chat.Completions.ChatCompletionContentPart = {
                type: 'text',
                text: `Select up to ${config.select} images by their visible numbers. Return their numbers (1-based).`
            };

            const response = await selectLlm.promptZod(
                { prefix: [preamble], suffix: imageParts },
                SelectionSchema
            );

            console.log(`[ImageSearch] Selected: ${response.selected_indices.join(', ')}. Reason: ${response.reasoning}`);

            for (const idx of response.selected_indices.slice(0, config.select)) {
                const img = indexMap.get(idx);
                if (img) selectedImages.push(img);
            }
        } else {
            selectedImages = pooledImages.slice(0, config.select);
        }

        // Build packets
        const packets: any[] = [];
        const sharp = (await import('sharp')).default;

        for (let i = 0; i < selectedImages.length; i++) {
            const img = selectedImages[i];
            const filename = `${baseName}_selected_${i}.jpg`;
            const savePath = path.join(selectedDir, filename);

            try {
                const processed = await sharp(img.buffer)
                    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 80 })
                    .toBuffer();

                await ArtifactSaver.save(processed, savePath);

                const base64 = processed.toString('base64');
                const contentPart: OpenAI.Chat.Completions.ChatCompletionContentPart = {
                    type: 'image_url',
                    image_url: { url: `data:image/jpeg;base64,${base64}` }
                };

                packets.push({
                    data: {
                        ...img.metadata,
                        localPath: savePath,
                        searchIndex: i + 1
                    },
                    contentParts: [contentPart]
                });
            } catch (e) {
                console.warn(`[ImageSearch] Failed to process image:`, e);
            }
        }

        return { packets };
    }
}
