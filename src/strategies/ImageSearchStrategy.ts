import OpenAI from 'openai';
import { z } from 'zod';
import path from 'path';
import { LlmClient } from 'llm-fns';
import { AiImageSearch } from '../utils/AiImageSearch.js';
import { SerperImage } from '../utils/ImageSearch.js';
import { ResolvedStepConfig } from '../StepConfigurator.js';
import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { ArtifactSaver } from '../ArtifactSaver.js';

export class ImageSearchStrategy implements GenerationStrategy {
    constructor(
        private aiImageSearch: AiImageSearch,
        private llm: LlmClient
    ) {}

    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: ResolvedStepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        cacheSalt?: string | number,
        outputPathOverride?: string,
        skipCommands?: boolean
    ): Promise<GenerationResult> {
        
        const queries: string[] = [];

        // 1. Collect Queries
        if (config.imageSearchQuery) {
            queries.push(config.imageSearchQuery);
        }

        if (config.imageSearchPrompt) {
            console.log(`[Row ${index}] Step ${stepIndex} Generating search queries...`);
            
            const QuerySchema = z.object({
                queries: z.array(z.string()).min(1).describe("A list of diverse search queries")
            });

            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                { role: 'system', content: 'You are a research assistant. Generate diverse search queries based on the user request.' },
                { role: 'user', content: config.imageSearchPrompt }
            ];

            const response = await this.llm.promptZod(messages, QuerySchema, {
                cacheSalt: `${cacheSalt}_gen_queries`
            });

            queries.push(...response.queries);
            console.log(`[Row ${index}] Step ${stepIndex} Generated queries: ${response.queries.join(', ')}`);
        }

        if (queries.length === 0) {
            throw new Error("Image Search Strategy invoked but no queries provided (via raw query or prompt).");
        }

        // 2. Execute Searches (Breadth-First)
        console.log(`[Row ${index}] Step ${stepIndex} Executing ${queries.length} searches (Limit: ${config.imageSearchLimit} per query)...`);
        
        // We access the underlying ImageSearch instance to run raw searches
        // Since AiImageSearch wraps it, we might need to expose it or add a method.
        // For now, let's assume we can use AiImageSearch's internal search or we just use AiImageSearch.searchAndSelect logic
        // BUT AiImageSearch.searchAndSelect does the whole flow. We want to pool first.
        // Let's modify AiImageSearch to allow searching without selecting, OR we just use the public search method if we exposed it.
        // Actually, AiImageSearch has `private imageSearch`. We should probably add a public `search` method to AiImageSearch that delegates.
        // Or better, let's just use the `imageSearch` instance directly if we had access.
        // Since we don't want to break encapsulation too much, let's assume we update AiImageSearch to have a `search(query, count)` method that returns SerperImage[].
        // Wait, `AiImageSearch` constructor takes `ImageSearch`. We can just inject `ImageSearch` into this strategy too?
        // No, let's stick to `AiImageSearch` being the main entry point. I will add a `search` method to `AiImageSearch` in the next file update.
        
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
            // AI Selection
            // We need to convert the prompt parts back to string for the current AiImageSearch signature, 
            // or update AiImageSearch to accept parts. The current signature takes `string`.
            // Let's extract text from parts.
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
            // Direct Selection (First N)
            console.log(`[Row ${index}] Step ${stepIndex} Selecting first ${config.imageSearchSelect} images (no AI prompt)...`);
            selectedImages = pooledImages.slice(0, config.imageSearchSelect);
        }

        // 4. Output
        const effectiveOutputPath = outputPathOverride || config.outputPath;
        const savedPaths: string[] = [];

        if (effectiveOutputPath) {
            const ext = path.extname(effectiveOutputPath);
            const base = path.basename(effectiveOutputPath, ext);
            const dir = path.dirname(effectiveOutputPath);

            for (let i = 0; i < selectedImages.length; i++) {
                const img = selectedImages[i];
                // If multiple images, append index. If single, keep original name (unless forced).
                // If we selected 1, use exact path. If > 1, use suffix.
                let finalPath = effectiveOutputPath;
                if (selectedImages.length > 1) {
                    finalPath = path.join(dir, `${base}_${i + 1}${ext}`);
                }

                await ArtifactSaver.save(img.imageUrl, finalPath);
                savedPaths.push(finalPath);
                console.log(`[Row ${index}] Step ${stepIndex} Saved image to ${finalPath}`);
            }
        } else {
            // If no output path, we just return URLs
            savedPaths.push(...selectedImages.map(img => img.imageUrl));
        }

        // Return result
        // If multiple, join with comma? Or JSON array? JSON array is safer for downstream.
        const columnValue = savedPaths.length === 1 ? savedPaths[0] : JSON.stringify(savedPaths);

        return {
            historyMessage: {
                role: 'assistant',
                content: `[Image Search] Selected: ${columnValue}`
            },
            columnValue
        };
    }
}
