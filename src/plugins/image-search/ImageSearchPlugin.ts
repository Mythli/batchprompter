import { Command } from 'commander';
import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import { ContentProviderPlugin, PluginContext, PluginResult, NormalizedPluginConfig } from '../types.js';
import { ModelFlags } from '../../cli/ModelFlags.js';
import { ModelDefinition, ResolvedModelConfig } from '../../types.js';
import { PluginHelpers } from '../../utils/PluginHelpers.js';
import { ArtifactSaver } from '../../ArtifactSaver.js';
import { ensureDir } from '../../utils/fileUtils.js';
import { AiImageSearch } from '../../utils/AiImageSearch.js';

// --- Configuration Types ---

interface ImageSearchRawConfig {
    query?: string;
    queryConfig?: ModelDefinition;
    selectConfig?: ModelDefinition;
    limit: number;
    select: number;
    queryCount: number;
    spriteSize: number;
}

interface ImageSearchResolvedConfig {
    query?: string;
    queryConfig?: ResolvedModelConfig;
    selectConfig?: ResolvedModelConfig;
    limit: number;
    select: number;
    queryCount: number;
    spriteSize: number;
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
    }

    registerStep(program: Command, stepIndex: number): void {
        ModelFlags.register(program, `image-query-${stepIndex}`, { includePrompt: true });
        ModelFlags.register(program, `image-select-${stepIndex}`, { includePrompt: true });

        program.option(`--image-search-query-${stepIndex} <text>`, `Search query for step ${stepIndex}`);
        program.option(`--image-search-limit-${stepIndex} <number>`, `Search limit for step ${stepIndex}`);
        program.option(`--image-search-select-${stepIndex} <number>`, `Select count for step ${stepIndex}`);
        program.option(`--image-search-query-count-${stepIndex} <number>`, `Query count for step ${stepIndex}`);
        program.option(`--image-search-sprite-size-${stepIndex} <number>`, `Sprite size for step ${stepIndex}`);
    }

    normalize(options: Record<string, any>, stepIndex: number, globalConfig: any): NormalizedPluginConfig | undefined {
        
        // Instantiate ModelFlags with the global default model
        const modelFlags = new ModelFlags(globalConfig.model);

        // Helper to extract model config using the instance
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

        // 1. Extract Configurations
        const queryConfig = extractModel(`image-query-${stepIndex}`, 'image-query');
        const selectConfig = extractModel(`image-select-${stepIndex}`, 'image-select');
        const query = getOpt('imageSearchQuery');

        // 2. Check Activation
        const isActive = !!(query || queryConfig || selectConfig);

        if (!isActive) return undefined;

        // 3. Validation
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
            spriteSize: parseInt(getOpt('imageSearchSpriteSize') || '4', 10)
        };

        return {
            config
        };
    }

    async prepare(config: ImageSearchRawConfig, row: Record<string, any>): Promise<ImageSearchResolvedConfig> {
        const resolved: ImageSearchResolvedConfig = {
            limit: config.limit,
            select: config.select,
            queryCount: config.queryCount,
            spriteSize: config.spriteSize
        };

        // 1. Resolve Static Query
        if (config.query) {
            resolved.query = Handlebars.compile(config.query, { noEscape: true })(row);
        }

        // 2. Resolve Query Config
        if (config.queryConfig) {
            resolved.queryConfig = await PluginHelpers.resolveModelConfig(config.queryConfig, row);
        }

        // 3. Resolve Select Config
        if (config.selectConfig) {
            resolved.selectConfig = await PluginHelpers.resolveModelConfig(config.selectConfig, row);
        }

        return resolved;
    }

    async execute(context: PluginContext): Promise<PluginResult> {
        const { row, stepIndex, config, stepContext, outputDirectory, tempDirectory, outputBasename, outputExtension, output } = context;
        const resolvedConfig = config as ImageSearchResolvedConfig;

        // Check Services
        if (!stepContext.global.imageSearch) {
            throw new Error(
                `Step ${stepIndex} requires Image Search, but SERPER_API_KEY is missing from environment variables.`
            );
        }

        const imageSearch = stepContext.global.imageSearch;
        
        // Create AI Image Search Agent
        // We need a selectLlm if selection is configured
        let selectLlm;
        if (resolvedConfig.selectConfig) {
            selectLlm = stepContext.createLlmClient(resolvedConfig.selectConfig);
        }
        
        // Note: AiImageSearch constructor requires selectLlm. 
        // If selectConfig is missing, we might not need AiImageSearch for selection, 
        // but we might need it for query generation?
        // Actually, query generation is done manually below.
        // AiImageSearch is mostly for selection.
        // If no select config, we just slice.
        
        // However, to keep it clean, let's instantiate AiImageSearch only if needed or pass a dummy?
        // Or better, just use the class if we have the config.
        
        let aiImageSearch: AiImageSearch | undefined;
        if (selectLlm) {
            aiImageSearch = new AiImageSearch(imageSearch, selectLlm, resolvedConfig.spriteSize);
        }

        // --- Execution Logic ---

        // Organize Temp Directory
        const rawDir = path.join(tempDirectory, 'raw');
        const spritesDir = path.join(tempDirectory, 'sprites');
        const selectedDir = path.join(tempDirectory, 'selected');

        await ensureDir(rawDir);
        await ensureDir(spritesDir);
        await ensureDir(selectedDir);
        
        // Determine base naming
        const baseName = outputBasename || 'image';
        const ext = outputExtension || '.jpg';

        const queries: string[] = [];

        // 1. Collect Queries
        if (resolvedConfig.query) {
            queries.push(resolvedConfig.query);
        }

        if (resolvedConfig.queryConfig) {
            console.log(`[Row ${context.row.index}] Step ${stepIndex} Generating search queries...`);
            
            const { z } = await import('zod');
            const QuerySchema = z.object({
                queries: z.array(z.string()).min(1).max(resolvedConfig.queryCount)
            });

            const queryLlm = stepContext.createLlmClient(resolvedConfig.queryConfig);
            const response = await queryLlm.promptZod(row, QuerySchema);
            
            queries.push(...response.queries);
            console.log(`[Row ${context.row.index}] Step ${stepIndex} Generated queries: ${response.queries.join(', ')}`);
        }

        if (queries.length === 0) return { contentParts: [], data: [] };

        // 2. Execute Searches
        console.log(`[Row ${context.row.index}] Step ${stepIndex} Executing ${queries.length} searches...`);
        const searchPromises = queries.map(q => imageSearch.search(q, resolvedConfig.limit));
        
        const results = await Promise.allSettled(searchPromises);

        const pooledImages: any[] = [];
        const seenUrls = new Set<string>();
        
        for (const result of results) {
            if (result.status === 'fulfilled') {
                const group = result.value;
                for (const img of group) {
                    if (!seenUrls.has(img.metadata.imageUrl)) {
                        seenUrls.add(img.metadata.imageUrl);
                        pooledImages.push(img);
                    }
                }
            } else {
                console.warn(`[Row ${context.row.index}] Step ${stepIndex} Image search query failed:`, result.reason);
            }
        }

        if (pooledImages.length === 0) throw new Error("No images found.");

        // Save raw images to 'raw' folder
        await Promise.all(pooledImages.map(async (img, idx) => {
            const filename = `${baseName}_raw_${idx}.jpg`;
            const savePath = path.join(rawDir, filename);
            try {
                await ArtifactSaver.save(img.buffer, savePath);
            } catch (e) {
                console.warn(`Failed to save raw image ${filename}`, e);
            }
        }));

        // 3. Selection
        let selectedImages: any[] = [];
        if (aiImageSearch && resolvedConfig.selectConfig) {
            console.log(`[Row ${context.row.index}] Step ${stepIndex} AI Selecting best images...`);
            
            selectedImages = await aiImageSearch.selectFromPool(
                pooledImages,
                row,
                resolvedConfig.select,
                async (buffer, spriteIndex) => {
                    // Save sprites to 'sprites' folder
                    const filename = `${baseName}_sprite_${spriteIndex}.jpg`;
                    const savePath = path.join(spritesDir, filename);
                    await ArtifactSaver.save(buffer, savePath);
                },
                resolvedConfig.spriteSize
            );
        } else {
            selectedImages = pooledImages.slice(0, resolvedConfig.select);
        }

        // 4. Process Output
        const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        const sharp = (await import('sharp')).default;
        const selectedMetadata: any[] = [];

        for (let i = 0; i < selectedImages.length; i++) {
            const img = selectedImages[i];
            // Save selected images to 'selected' folder (intermediate)
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
                data: selectedMetadata // Explode: [Img1, Img2, ...]
            };
        } else {
            return {
                contentParts,
                data: [selectedMetadata] // Enrich: [ [Img1, Img2, ...] ]
            };
        }
    }
}
