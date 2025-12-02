import { Command } from 'commander';
import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import { ContentProviderPlugin, PluginContext } from '../types.js';
import { ModelFlags } from '../../cli/ModelFlags.js';
import { ModelDefinition, ResolvedModelConfig } from '../../types.js';
import { PluginHelpers } from '../../utils/PluginHelpers.js';
import { AiImageSearch } from '../../utils/AiImageSearch.js';
import { ImageSearch } from './ImageSearch.js';
import { createCachedFetcher } from '../../utils/createCachedFetcher.js';
import { ArtifactSaver } from '../../ArtifactSaver.js';

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
    private aiImageSearch?: AiImageSearch;

    constructor() {
        // Initialize services if API key is present
        const apiKey = process.env.SERPER_API_KEY || process.env.BATCHPROMPT_SERPER_API_KEY;
        if (apiKey) {
            // We need a fetcher. Since we don't have the global cache here easily, 
            // we might need to defer initialization or create a standalone fetcher.
            // For now, let's assume we can create a fetcher or pass it in.
            // Ideally, the plugin should receive services in execute(), but AiImageSearch is stateful/complex.
            // Let's initialize it lazily or in execute if possible, but execute receives LlmClient.
            
            // We'll initialize the core ImageSearch here, but we need the LLM for AiImageSearch.
            // We will create AiImageSearch on the fly in execute() using the context.llm.
        }
    }

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

    normalize(options: Record<string, any>, stepIndex: number, globalConfig: any): ImageSearchRawConfig | undefined {
        
        // Helper to extract model config using the enhanced ModelFlags.extract
        const extractModel = (namespace: string, fallbackNamespace: string): ModelDefinition | undefined => {
            const config = ModelFlags.extract(options, namespace, fallbackNamespace, globalConfig.model);
            
            // Check if any key was actually set (excluding the default model if nothing else is set)
            // We check if promptSource or systemSource is set, OR if model was explicitly set in options
            // But ModelFlags.extract merges everything.
            // A better check for "is active" is if promptSource is present.
            
            if (!config.promptSource && !config.systemSource && !config.model) return undefined;
            
            // If we only have the default model, but no prompt/system, it's probably not active unless intended.
            // For image-query, we need a prompt.
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

        return {
            query,
            queryConfig,
            selectConfig,
            limit: parseInt(getOpt('imageSearchLimit') || '12', 10),
            select: parseInt(getOpt('imageSearchSelect') || '1', 10),
            queryCount: parseInt(getOpt('imageSearchQueryCount') || '3', 10),
            spriteSize: parseInt(getOpt('imageSearchSpriteSize') || '4', 10)
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

    async execute(context: PluginContext): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        const { row, stepIndex, config, llm, globalConfig } = context;
        const resolvedConfig = config as ImageSearchResolvedConfig;

        // Check API Key
        const apiKey = process.env.SERPER_API_KEY || process.env.BATCHPROMPT_SERPER_API_KEY;
        if (!apiKey) {
            throw new Error(
                `Step ${stepIndex} requires Image Search, but SERPER_API_KEY is missing from environment variables.`
            );
        }

        // Initialize Services (Lazy)
        const fetcher = createCachedFetcher({
            prefix: 'serper',
            timeout: 30000,
            ttl: 24 * 60 * 60 * 1000 // 24h
        });
        
        const imageSearch = new ImageSearch(apiKey, fetcher);
        const aiImageSearch = new AiImageSearch(imageSearch, llm, resolvedConfig.spriteSize);

        // --- Execution Logic ---

        let outputDir = globalConfig.tmpDir;
        let filePrefix = `${String(context.row.index || 0).padStart(3, '0')}_${String(stepIndex).padStart(2, '0')}`;
        
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

            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
            if (resolvedConfig.queryConfig.systemParts) {
                const text = resolvedConfig.queryConfig.systemParts.map(p => p.type === 'text' ? p.text : '').join('\n');
                messages.push({ role: 'system', content: text });
            }
            if (resolvedConfig.queryConfig.promptParts) {
                messages.push({ role: 'user', content: resolvedConfig.queryConfig.promptParts });
            }

            const response = await llm.promptZod(messages, QuerySchema, {
                model: resolvedConfig.queryConfig.model,
                temperature: resolvedConfig.queryConfig.temperature,
                reasoning_effort: resolvedConfig.queryConfig.thinkingLevel
            });
            
            queries.push(...response.queries);
            console.log(`[Row ${context.row.index}] Step ${stepIndex} Generated queries: ${response.queries.join(', ')}`);
        }

        if (queries.length === 0) return [];

        // 2. Execute Searches
        console.log(`[Row ${context.row.index}] Step ${stepIndex} Executing ${queries.length} searches...`);
        const searchPromises = queries.map(q => imageSearch.search(q, resolvedConfig.limit));
        const results = await Promise.all(searchPromises);

        const pooledImages: any[] = [];
        const seenUrls = new Set<string>();
        for (const group of results) {
            for (const img of group) {
                if (!seenUrls.has(img.metadata.imageUrl)) {
                    seenUrls.add(img.metadata.imageUrl);
                    pooledImages.push(img);
                }
            }
        }

        if (pooledImages.length === 0) throw new Error("No images found.");

        // 3. Selection
        let selectedImages: any[] = [];
        if (resolvedConfig.selectConfig) {
            console.log(`[Row ${context.row.index}] Step ${stepIndex} AI Selecting best images...`);
            
            selectedImages = await aiImageSearch.selectFromPool(
                pooledImages,
                resolvedConfig.selectConfig,
                row,
                resolvedConfig.select,
                async (buffer, spriteIndex) => {
                    const filename = `${filePrefix}_sprite_${spriteIndex}.jpg`;
                    const savePath = path.join(outputDir, filename);
                    await ArtifactSaver.save(buffer, savePath);
                }
            );
        } else {
            selectedImages = pooledImages.slice(0, resolvedConfig.select);
        }

        // 4. Process Output
        const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        const sharp = (await import('sharp')).default;

        for (let i = 0; i < selectedImages.length; i++) {
            const img = selectedImages[i];
            const filename = `${filePrefix}_selected_${i}.jpg`;
            const savePath = path.join(outputDir, filename);

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
            } catch (e) {
                console.warn(`Failed to process image ${img.metadata.imageUrl}`, e);
            }
        }

        return contentParts;
    }
}
