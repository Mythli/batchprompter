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
        // Use the cached download from ImageSearch
        const buffer = await this.aiImageSearch.getImageSearch().download(url);

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

        // --- DEBUG: Save all found images ---
        // We do this asynchronously to not block too much, but we await it to ensure files exist for debugging
        const saveFoundPromises = pooledImages.map(async (img, i) => {
            try {
                const filename = `${String(index).padStart(3, '0')}_${String(stepIndex).padStart(2, '0')}_found_${i}.jpg`;
                const savePath = path.join(config.tmpDir, filename);
                
                // Use cached download to save to disk
                const buffer = await this.aiImageSearch.getImageSearch().download(img.imageUrl);
                await ArtifactSaver.save(buffer, savePath);
            } catch (e) {
                // Ignore save errors for debug files
            }
        });
        await Promise.all(saveFoundPromises);

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
                config.imageSearchSelect,
                // Callback to save sprites
                async (buffer, spriteIndex) => {
                    const filename = `${String(index).padStart(3, '0')}_${String(stepIndex).padStart(2, '0')}_sprite_${spriteIndex}.jpg`;
                    const savePath = path.join(config.tmpDir, filename);
                    await ArtifactSaver.save(buffer, savePath);
                }
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
            
            // Save selected image to tmpDir
            const filename = `${String(index).padStart(3, '0')}_${String(stepIndex).padStart(2, '0')}_selected_${i}.jpg`;
            const savePath = path.join(config.tmpDir, filename);
            
            // Normalize for History (Base64 JPEG)
            try {
                const base64 = await this.normalizeImage(img.imageUrl);
                
                // Save the normalized version as the "selected" one
                await ArtifactSaver.save(Buffer.from(base64, 'base64'), savePath);
                savedPaths.push(savePath);

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
                // Try to save original URL content
                try { 
                    const buffer = await this.aiImageSearch.getImageSearch().download(img.imageUrl);
                    await ArtifactSaver.save(buffer, savePath); 
                    savedPaths.push(savePath); 
                } catch(e2) {}
            }
        }

        return { contentParts, savedPaths };
    }
}
