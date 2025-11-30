import OpenAI from 'openai';
import { z } from 'zod';
import path from 'path';
import sharp from 'sharp';
import { LlmClient } from 'llm-fns';
import { AiImageSearch } from './AiImageSearch.js';
import { SerperImage } from './ImageSearch.js';
import { ResolvedStepConfig } from '../StepConfigurator.js';
import { ArtifactSaver } from '../ArtifactSaver.js';

export class ImageSearchTool {
    constructor(
        private aiImageSearch: AiImageSearch,
        private llm: LlmClient
    ) {}

    private async normalizeImage(url: string): Promise<string> {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${url}`);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const processedBuffer = await sharp(buffer)
            .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();

        return processedBuffer.toString('base64');
    }

    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: ResolvedStepConfig,
        cacheSalt?: string | number
    ): Promise<{ contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[], savedPaths: string[] }> {
        
        const queries: string[] = [];

        // 1. Collect Queries
        if (config.imageSearchQuery) {
            queries.push(config.imageSearchQuery);
        }

        if (config.imageSearchPrompt) {
            console.log(`[Row ${index}] Step ${stepIndex} Generating search queries...`);
            
            const QuerySchema = z.object({
                queries: z.array(z.string()).min(1).max(3).describe("A list of up to 3 diverse search queries")
            });

            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                { role: 'system', content: 'You are a research assistant. Generate up to 3 diverse search queries based on the user request.' },
                { role: 'user', content: config.imageSearchPrompt }
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

        // 2. Execute Searches (Breadth-First)
        console.log(`[Row ${index}] Step ${stepIndex} Executing ${queries.length} searches (Limit: ${config.imageSearchLimit} per query)...`);
        
        const searchPromises = queries.map(q => this.aiImageSearch.search(q, config.imageSearchLimit));
        const results = await Promise.all(searchPromises);
        
        // Pool and Deduplicate
        const pooledImages: SerperImage[] = [];
        const seenUrls = new Set<string>();

        for (const group of results) {
            for (const img of group) {
                if (!seenUrls.has(img.imageUrl)) {
                    seenUrls.add(img.imageUrl);
                    pooledImages.push(img);
                }
            }
        }

        console.log(`[Row ${index}] Step ${stepIndex} Found ${pooledImages.length} unique images.`);

        if (pooledImages.length === 0) {
            throw new Error("No images found for any of the queries.");
        }

        // 3. Selection
        let selectedImages: SerperImage[] = [];

        if (config.imageSelectPrompt) {
            const selectPromptText = config.imageSelectPrompt
                .filter(p => p.type === 'text')
                .map(p => p.text)
                .join('\n');

            console.log(`[Row ${index}] Step ${stepIndex} AI Selecting best images...`);
            selectedImages = await this.aiImageSearch.selectFromPool(
                pooledImages, 
                queries.join(', '), // Context
                selectPromptText, 
                config.imageSearchSelect
            );
        } else {
            console.log(`[Row ${index}] Step ${stepIndex} Selecting first ${config.imageSearchSelect} images (no AI prompt)...`);
            selectedImages = pooledImages.slice(0, config.imageSearchSelect);
        }

        // 4. Process & Output
        const savedPaths: string[] = [];
        const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            { type: 'text', text: `I have found the following images based on the search queries: ${queries.join(', ')}` }
        ];

        for (let i = 0; i < selectedImages.length; i++) {
            const img = selectedImages[i];
            
            // Normalize for History (Base64 JPEG)
            try {
                const base64 = await this.normalizeImage(img.imageUrl);
                contentParts.push({
                    type: 'image_url',
                    image_url: { url: `data:image/jpeg;base64,${base64}` }
                });
            } catch (e) {
                console.warn(`[Row ${index}] Step ${stepIndex} Failed to normalize image for history: ${img.imageUrl}`, e);
                // Fallback to URL if normalization fails
                contentParts.push({
                    type: 'image_url',
                    image_url: { url: img.imageUrl }
                });
            }

            // Save to Disk if output path is configured
            // Note: StandardStrategy handles the main output path. 
            // If we want to save these search results separately, we might need a dedicated path or just rely on the fact they are in history.
            // However, the previous logic saved them to the output path if provided.
            // In this new model, StandardStrategy generates NEW content. 
            // So we probably shouldn't overwrite the main output path with search results unless explicitly requested.
            // But for now, let's just return the paths/content and let StandardStrategy decide or just use them as context.
            // If the user wants to SAVE the search results, they might need a specific flag or we assume they are just context for the generation.
            
            // Let's save them to a sidecar folder or just log them? 
            // The requirement was "these images should just go into the prompt".
            // So we won't save them to the main output path here, to avoid conflict with the generated text/image.
            // We will just return them as content parts.
            savedPaths.push(img.imageUrl);
        }

        return { contentParts, savedPaths };
    }
}
