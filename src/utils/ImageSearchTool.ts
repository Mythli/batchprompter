import OpenAI from 'openai';
import { z } from 'zod';
import path from 'path';
import sharp from 'sharp';
import Handlebars from 'handlebars';
import { LlmClient } from 'llm-fns';
import { AiImageSearch } from './AiImageSearch.js';
import { SerperImage, ImageSearchResult } from './ImageSearch.js';
import { StepConfig } from '../types.js';
import { ArtifactSaver } from '../ArtifactSaver.js';

export class ImageSearchTool {
    constructor(
        private aiImageSearch: AiImageSearch,
        private llm: LlmClient
    ) {}

    private async normalizeImage(buffer: Buffer): Promise<string> {
        const processedBuffer = await sharp(buffer)
            .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();

        return processedBuffer.toString('base64');
    }

    private renderParts(
        parts: OpenAI.Chat.Completions.ChatCompletionContentPart[], 
        row: Record<string, any>
    ): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
        return parts.map(part => {
            if (part.type === 'text') {
                const delegate = Handlebars.compile(part.text, { noEscape: true });
                return { type: 'text', text: delegate(row) };
            }
            return part;
        });
    }

    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: StepConfig,
        cacheSalt?: string | number
    ): Promise<{ contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[], savedPaths: string[] }> {
        
        if (!config.imageSearch) return { contentParts: [], savedPaths: [] };
        const searchConfig = config.imageSearch;

        // Determine output directory
        let outputDir = config.tmpDir;
        let filePrefix = `${String(index).padStart(3, '0')}_${String(stepIndex).padStart(2, '0')}`;

        if (config.outputPath) {
            const dir = path.dirname(config.outputPath);
            const ext = path.extname(config.outputPath);
            const name = path.basename(config.outputPath, ext);
            outputDir = path.join(config.tmpDir, dir);
            filePrefix = name;
        }

        const queries: string[] = [];

        // 1. Collect Queries
        if (searchConfig.query) {
            queries.push(searchConfig.query);
        }

        if (searchConfig.promptParts && searchConfig.promptParts.length > 0) {
            console.log(`[Row ${index}] Step ${stepIndex} Generating search queries...`);
            
            const renderedPromptParts = this.renderParts(searchConfig.promptParts, row);
            const queryCount = searchConfig.queryCount;
            
            const QuerySchema = z.object({
                queries: z.array(z.string()).min(1).max(queryCount).describe(`A list of up to ${queryCount} diverse search queries`)
            });

            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                { role: 'system', content: `You are a research assistant. Generate up to ${queryCount} diverse search queries based on the user request.` },
                { role: 'user', content: renderedPromptParts }
            ];

            const response = await this.llm.promptZod(messages, QuerySchema, {
                cacheSalt: `${cacheSalt}_gen_queries`
            });

            queries.push(...response.queries);
            console.log(`[Row ${index}] Step ${stepIndex} Generated queries: ${response.queries.join(', ')}`);
        }

        if (queries.length === 0) {
            return { contentParts: [], savedPaths: [] };
        }

        // 2. Execute Searches
        console.log(`[Row ${index}] Step ${stepIndex} Executing ${queries.length} searches (Limit: ${searchConfig.limit} per query)...`);
        
        const searchPromises = queries.map(q => this.aiImageSearch.search(q, searchConfig.limit));
        const results = await Promise.all(searchPromises);
        
        // Pool and Deduplicate
        const pooledImages: ImageSearchResult[] = [];
        const seenUrls = new Set<string>();

        for (const group of results) {
            for (const img of group) {
                if (!seenUrls.has(img.metadata.imageUrl)) {
                    seenUrls.add(img.metadata.imageUrl);
                    pooledImages.push(img);
                }
            }
        }

        console.log(`[Row ${index}] Step ${stepIndex} Found ${pooledImages.length} unique images.`);

        if (pooledImages.length === 0) {
            throw new Error("No images found for any of the queries.");
        }

        // Save found images for debug
        const saveFoundPromises = pooledImages.map(async (img, i) => {
            try {
                const filename = `${filePrefix}_found_${i}.jpg`;
                const savePath = path.join(outputDir, filename);
                await ArtifactSaver.save(img.buffer, savePath);
            } catch (e) {}
        });
        await Promise.all(saveFoundPromises);

        // 3. Selection
        let selectedImages: ImageSearchResult[] = [];

        if (searchConfig.selectPromptParts && searchConfig.selectPromptParts.length > 0) {
            const renderedSelectParts = this.renderParts(searchConfig.selectPromptParts, row);
            
            // Extract text for the select prompt (AiImageSearch expects string currently)
            // We should probably update AiImageSearch to take ContentParts, but for now join text
            const selectPromptText = renderedSelectParts
                .filter(p => p.type === 'text')
                .map(p => p.text)
                .join('\n');

            console.log(`[Row ${index}] Step ${stepIndex} AI Selecting best images...`);
            
            selectedImages = await this.aiImageSearch.selectFromPool(
                pooledImages, 
                queries.join(', '), 
                selectPromptText, 
                searchConfig.select,
                async (buffer, spriteIndex) => {
                    const filename = `${filePrefix}_sprite_${spriteIndex}.jpg`;
                    const savePath = path.join(outputDir, filename);
                    await ArtifactSaver.save(buffer, savePath);
                },
                searchConfig.spriteSize
            );
        } else {
            console.log(`[Row ${index}] Step ${stepIndex} Selecting first ${searchConfig.select} images (no AI prompt)...`);
            selectedImages = pooledImages.slice(0, searchConfig.select);
        }

        // 4. Process & Output
        const savedPaths: string[] = [];
        const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

        for (let i = 0; i < selectedImages.length; i++) {
            const img = selectedImages[i];
            const filename = `${filePrefix}_selected_${i}.jpg`;
            const savePath = path.join(outputDir, filename);
            
            try {
                const base64 = await this.normalizeImage(img.buffer);
                await ArtifactSaver.save(Buffer.from(base64, 'base64'), savePath);
                savedPaths.push(savePath);

                contentParts.push({
                    type: 'image_url',
                    image_url: { url: `data:image/jpeg;base64,${base64}` }
                });
            } catch (e) {
                console.warn(`[Row ${index}] Step ${stepIndex} Failed to normalize image: ${img.metadata.imageUrl}`, e);
                contentParts.push({
                    type: 'image_url',
                    image_url: { url: img.metadata.imageUrl }
                });
            }
        }

        return { contentParts, savedPaths };
    }
}
