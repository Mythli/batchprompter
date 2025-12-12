import { Command } from 'commander';
import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import { z } from 'zod';
import { ContentProviderPlugin, PluginContext, PluginResult, NormalizedPluginConfig } from '../types.js';
import { ModelFlags } from '../../cli/ModelFlags.js';
import { ModelDefinition, ResolvedModelConfig, ServiceCapabilities } from '../../types.js';
import { PluginHelpers } from '../../utils/PluginHelpers.js';
import { ArtifactSaver } from '../../ArtifactSaver.js';
import { ensureDir } from '../../utils/fileUtils.js';
import { AiImageSearch } from '../../utils/AiImageSearch.js';

interface ImageSearchRawConfig {
    query?: string;
    queryConfig?: ModelDefinition;
    selectConfig?: ModelDefinition;
    limit: number;
    select: number;
    queryCount: number;
    spriteSize: number;
    maxPages: number;
    dedupeStrategy: 'none' | 'domain' | 'url';
    gl?: string;
    hl?: string;
}

interface ImageSearchResolvedConfig {
    query?: string;
    queryConfig?: ResolvedModelConfig;
    selectConfig?: ResolvedModelConfig;
    limit: number;
    select: number;
    queryCount: number;
    spriteSize: number;
    maxPages: number;
    dedupeStrategy: 'none' | 'domain' | 'url';
    gl?: string;
    hl?: string;
}

export class ImageSearchPlugin implements ContentProviderPlugin {
    name = 'image-search';

    constructor() {}

    register(program: Command): void {
        ModelFlags.register(program, 'image-query', { includePrompt: true });
        ModelFlags.register(program, 'image-select', { includePrompt: true });

        program.option('--image-search-query <text>', 'Raw search query');
        program.option('--image-search-limit <number>', 'Images per query', '12');
        program.option('--image-search-select <number>', 'Images to select', '1');
        program.option('--image-search-query-count <number>', 'Queries to generate', '3');
        program.option('--image-search-sprite-size <number>', 'Images per sprite', '4');
        program.option('--image-search-max-pages <number>', 'Max pages to fetch per query', '1');
        program.option('--image-search-dedupe-strategy <strategy>', 'Deduplication strategy (none, domain, url)', 'url');
        program.option('--image-search-gl <country>', 'Country code for search results (e.g. us, de)');
        program.option('--image-search-hl <lang>', 'Language code for search results (e.g. en, de)');
    }

    registerStep(program: Command, stepIndex: number): void {
        ModelFlags.register(program, `image-query-${stepIndex}`, { includePrompt: true });
        ModelFlags.register(program, `image-select-${stepIndex}`, { includePrompt: true });

        program.option(`--image-search-query-${stepIndex} <text>`, `Search query for step ${stepIndex}`);
        program.option(`--image-search-limit-${stepIndex} <number>`, `Search limit for step ${stepIndex}`);
        program.option(`--image-search-select-${stepIndex} <number>`, `Select count for step ${stepIndex}`);
        program.option(`--image-search-query-count-${stepIndex} <number>`, `Query count for step ${stepIndex}`);
        program.option(`--image-search-sprite-size-${stepIndex} <number>`, `Sprite size for step ${stepIndex}`);
        program.option(`--image-search-max-pages-${stepIndex} <number>`, `Max pages for step ${stepIndex}`);
        program.option(`--image-search-dedupe-strategy-${stepIndex} <strategy>`, `Dedupe strategy for step ${stepIndex}`);
        program.option(`--image-search-gl-${stepIndex} <country>`, `Country code for step ${stepIndex}`);
        program.option(`--image-search-hl-${stepIndex} <lang>`, `Language code for step ${stepIndex}`);
    }

    normalize(
        options: Record<string, any>, 
        stepIndex: number, 
        globalConfig: any,
        capabilities: ServiceCapabilities
    ): NormalizedPluginConfig | undefined {
        const modelFlags = new ModelFlags(globalConfig.model);

        const extractModel = (namespace: string, fallbackNamespace: string): ModelDefinition | undefined => {
            const config = modelFlags.extract(options, namespace, fallbackNamespace);
            if (!config.promptSource && !config.systemSource && !config.model) return undefined;
            if (!config.promptSource && !config.systemSource) return undefined;
            return config as ModelDefinition;
        };

        const getOpt = (key: string) => {
            const specific = options[`${key}${stepIndex}`];
            if (specific !== undefined) return specific;
            return options[key];
        };

        const queryConfig = extractModel(`image-query-${stepIndex}`, 'image-query');
        const selectConfig = extractModel(`image-select-${stepIndex}`, 'image-select');
        const query = getOpt('imageSearchQuery');

        const isActive = !!(query || queryConfig || selectConfig);

        if (!isActive) return undefined;

        if (!capabilities.hasSerper) {
            throw new Error(
                `Step ${stepIndex} Image Search requires SERPER_API_KEY environment variable to be set.`
            );
        }

        if (!query && !queryConfig) {
            throw new Error(
                `Step ${stepIndex} Image Search Configuration Error: ` +
                `You must provide either a static query via --image-search-query or a query generation prompt via --image-query-prompt.`
            );
        }

        const config: ImageSearchRawConfig = {
            query,
            queryConfig,
            selectConfig,
            limit: parseInt(getOpt('imageSearchLimit') || '12', 10),
            select: parseInt(getOpt('imageSearchSelect') || '1', 10),
            queryCount: parseInt(getOpt('imageSearchQueryCount') || '3', 10),
            spriteSize: parseInt(getOpt('imageSearchSpriteSize') || '4', 10),
            maxPages: parseInt(getOpt('imageSearchMaxPages') || '1', 10),
            dedupeStrategy: (getOpt('imageSearchDedupeStrategy') || 'url') as 'none' | 'domain' | 'url',
            gl: getOpt('imageSearchGl'),
            hl: getOpt('imageSearchHl')
        };

        return { config };
    }

    async prepare(config: ImageSearchRawConfig, row: Record<string, any>): Promise<ImageSearchResolvedConfig> {
        const resolved: ImageSearchResolvedConfig = {
            limit: config.limit,
            select: config.select,
            queryCount: config.queryCount,
            spriteSize: config.spriteSize,
            maxPages: config.maxPages,
            dedupeStrategy: config.dedupeStrategy,
            gl: config.gl,
            hl: config.hl
        };

        if (config.query) {
            resolved.query = Handlebars.compile(config.query, { noEscape: true })(row);
        }

        if (config.queryConfig) {
            resolved.queryConfig = await PluginHelpers.resolveModelConfig(config.queryConfig, row);
        }

        if (config.selectConfig) {
            resolved.selectConfig = await PluginHelpers.resolveModelConfig(config.selectConfig, row);
        }

        return resolved;
    }

    async execute(context: PluginContext): Promise<PluginResult> {
        const { row, stepIndex, config, stepContext, tempDirectory, outputBasename, outputExtension, output } = context;
        const resolvedConfig = config as ImageSearchResolvedConfig;

        const imageSearch = stepContext.global.imageSearch!;
        
        const rawDir = path.join(tempDirectory, 'raw');
        const spritesDir = path.join(tempDirectory, 'sprites');
        const selectedDir = path.join(tempDirectory, 'selected');

        await ensureDir(rawDir);
        await ensureDir(spritesDir);
        await ensureDir(selectedDir);
        
        const baseName = outputBasename || 'image';
        const ext = outputExtension || '.jpg';

        const queries: string[] = [];

        if (resolvedConfig.query) {
            queries.push(resolvedConfig.query);
        }

        if (resolvedConfig.queryConfig) {
            console.log(`[Row ${context.row.index}] Step ${stepIndex} Generating search queries...`);
            
            const QuerySchema = z.object({
                queries: z.array(z.string()).min(1).max(resolvedConfig.queryCount)
            });

            // Create bound LLM with the query prompt already included
            const queryLlm = stepContext.createLlm(resolvedConfig.queryConfig);
            
            // Just call promptZod - the prompt from --image-query-prompt is already bound
            const response = await queryLlm.promptZod(QuerySchema);
            
            queries.push(...response.queries);
            console.log(`[Row ${context.row.index}] Step ${stepIndex} Generated queries: ${response.queries.join(', ')}`);
        }

        if (queries.length === 0) return { contentParts: [], data: [] };

        console.log(`[Row ${context.row.index}] Step ${stepIndex} Executing ${queries.length} searches...`);
        
        const pooledImages: any[] = [];
        const seenKeys = new Set<string>();

        for (const q of queries) {
            let page = 1;
            while (page <= resolvedConfig.maxPages) {
                try {
                    const results = await imageSearch.search(q, resolvedConfig.limit, page, resolvedConfig.gl, resolvedConfig.hl);
                    
                    if (results.length === 0) break;

                    for (const img of results) {
                        let key = img.metadata.imageUrl;
                        if (resolvedConfig.dedupeStrategy === 'domain') {
                            key = img.metadata.domain || key;
                        }
                        
                        if (resolvedConfig.dedupeStrategy !== 'none') {
                            if (seenKeys.has(key)) continue;
                            seenKeys.add(key);
                        }
                        
                        pooledImages.push(img);
                    }
                    
                    page++;
                } catch (e: any) {
                    console.warn(`[Row ${context.row.index}] Step ${stepIndex} Image search query "${q}" page ${page} failed:`, e.message);
                    break;
                }
            }
        }

        if (pooledImages.length === 0) throw new Error("No images found.");

        await Promise.all(pooledImages.map(async (img, idx) => {
            const filename = `${baseName}_raw_${idx}.jpg`;
            const savePath = path.join(rawDir, filename);
            try {
                await ArtifactSaver.save(img.buffer, savePath);
            } catch (e) {
                console.warn(`Failed to save raw image ${filename}`, e);
            }
        }));

        let selectedImages: any[] = [];
        if (resolvedConfig.selectConfig) {
            console.log(`[Row ${context.row.index}] Step ${stepIndex} AI Selecting best images from pool of ${pooledImages.length}...`);
            
            // Create bound LLM with the select prompt already included
            const selectLlm = stepContext.createLlm(resolvedConfig.selectConfig);
            const aiImageSearch = new AiImageSearch(imageSearch, selectLlm, resolvedConfig.spriteSize);
            
            selectedImages = await aiImageSearch.selectFromPool(
                pooledImages,
                row,
                resolvedConfig.select,
                async (buffer, spriteIndex) => {
                    const filename = `${baseName}_sprite_${spriteIndex}.jpg`;
                    const savePath = path.join(spritesDir, filename);
                    await ArtifactSaver.save(buffer, savePath);
                },
                resolvedConfig.spriteSize
            );
        } else {
            selectedImages = pooledImages.slice(0, resolvedConfig.select);
        }

        const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        const sharp = (await import('sharp')).default;
        const selectedMetadata: any[] = [];

        for (let i = 0; i < selectedImages.length; i++) {
            const img = selectedImages[i];
            const filename = `${baseName}_selected_${i}${ext}`;
            const savePath = path.join(selectedDir, filename);

            try {
                const processedBuffer = await sharp(img.buffer)
                    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 80 })
                    .toBuffer();
                
                const base64 = processedBuffer.toString('base64');
                await ArtifactSaver.save(processedBuffer, savePath);

                contentParts.push({
                    type: 'image_url',
                    image_url: { url: `data:image/jpeg;base64,${base64}` }
                });

                selectedMetadata.push({
                    ...img.metadata,
                    localPath: savePath
                });

            } catch (e) {
                console.warn(`Failed to process image ${img.metadata.imageUrl}`, e);
            }
        }

        if (output.explode) {
            return {
                contentParts,
                data: selectedMetadata
            };
        } else {
            return {
                contentParts,
                data: [selectedMetadata]
            };
        }
    }
}
