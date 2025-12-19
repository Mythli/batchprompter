import OpenAI from 'openai';
import { z } from 'zod';
import { EventEmitter } from 'eventemitter3';
import { BoundLlmClient } from '../core/BoundLlmClient.js';
import { ImageSearch, ImageSearchResult } from '../plugins/image-search/ImageSearch.js';
import { SpriteGenerator } from './SpriteGenerator.js';
import { LlmListSelector } from './LlmListSelector.js';

export class AiImageSearch {
    public readonly events = new EventEmitter();

    constructor(
        private imageSearch: ImageSearch,
        private queryLlm?: BoundLlmClient,
        private selector?: LlmListSelector,
        private imagesPerSprite: number = 4
    ) {}

    async process(
        row: Record<string, any>,
        config: {
            query?: string;
            limit: number;
            queryCount: number;
            maxPages: number;
            dedupeStrategy: 'none' | 'domain' | 'url';
            gl?: string;
            hl?: string;
        }
    ): Promise<ImageSearchResult[]> {
        
        // 1. Generate Queries
        const queries: string[] = [];
        if (config.query) {
            queries.push(config.query);
        }

        if (this.queryLlm) {
            console.log(`[AiImageSearch] Generating search queries...`);
            const QuerySchema = z.object({
                queries: z.array(z.string()).min(1).max(config.queryCount)
            });
            const response = await this.queryLlm.promptZod(QuerySchema);
            queries.push(...response.queries);
            console.log(`[AiImageSearch] Generated queries: ${response.queries.join(', ')}`);
            
            this.events.emit('query:generated', { queries: response.queries });
        }

        if (queries.length === 0) return [];

        // 2. Scatter (Parallel Fetch)
        const tasks: { query: string; page: number }[] = [];
        for (const q of queries) {
            for (let p = 1; p <= config.maxPages; p++) {
                tasks.push({ query: q, page: p });
            }
        }

        console.log(`[AiImageSearch] Executing ${tasks.length} search tasks in parallel...`);

        const pageResults = await Promise.all(tasks.map(async ({ query, page }, taskIndex) => {
            try {
                const results = await this.imageSearch.search(query, 10, page, config.gl, config.hl);
                
                // Emit raw results (metadata only to save space/time in event payload if needed, but full object is better for debug)
                this.events.emit('search:result', { 
                    query, 
                    page, 
                    taskIndex,
                    results: results.map(r => r.metadata) 
                });

                if (results.length === 0) return [];

                // 3. Map (Local Selection)
                if (this.selector) {
                    return await this.selectFromPool(
                        this.selector, 
                        results, 
                        results.length, // Select as many as good ones
                        { phase: 'scatter', query, page, taskIndex }
                    ); 
                }
                return results;
            } catch (e) {
                console.warn(`[AiImageSearch] Task failed for "${query}" page ${page}:`, e);
                return [];
            }
        }));

        // 4. Gather & Dedupe
        const allSurvivors = pageResults.flat();
        const uniqueSurvivors: ImageSearchResult[] = [];
        const seenKeys = new Set<string>();

        const getDedupeKey = (result: ImageSearchResult): string => {
            let key = result.metadata.imageUrl;
            if (config.dedupeStrategy === 'domain') {
                key = result.metadata.domain || key;
            }
            return key;
        };

        for (const result of allSurvivors) {
            if (config.dedupeStrategy !== 'none') {
                const key = getDedupeKey(result);
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);
            }
            uniqueSurvivors.push(result);
        }

        // 5. Reduce (Global Selection)
        let finalSelection = uniqueSurvivors;

        if (this.selector && uniqueSurvivors.length > config.limit) {
            console.log(`[AiImageSearch] Reducing ${uniqueSurvivors.length} survivors to limit ${config.limit}...`);
            // Re-run selection on the combined pool
            finalSelection = await this.selectFromPool(
                this.selector, 
                uniqueSurvivors, 
                config.limit,
                { phase: 'reduce' }
            );
        } else if (uniqueSurvivors.length > config.limit) {
            finalSelection = uniqueSurvivors.slice(0, config.limit);
        }

        this.events.emit('result:selected', { results: finalSelection });

        return finalSelection;
    }

    private async selectFromPool(
        selector: LlmListSelector,
        images: ImageSearchResult[],
        maxSelected: number = 1,
        context: any = {}
    ): Promise<ImageSearchResult[]> {
        if (images.length === 0) return [];

        return selector.select(images, {
            maxSelected,
            promptPreamble: `Select the best ${maxSelected} image(s) by returning their visible numbers.`,
            indexOffset: 1, // Sprites are 1-based
            formatContent: async (items) => {
                const spriteSize = this.imagesPerSprite;
                const chunks: ImageSearchResult[][] = [];
                for (let i = 0; i < items.length; i += spriteSize) {
                    chunks.push(items.slice(i, i + spriteSize));
                }

                // Generate sprites in parallel
                const spritePromises = chunks.map(async (chunk, i) => {
                    const startNum = (i * spriteSize) + 1;
                    try {
                        const result = await SpriteGenerator.generate(chunk, startNum);
                        
                        // Emit artifacts
                        this.events.emit('artifact:sprite', {
                            buffer: result.spriteBuffer,
                            index: i,
                            startNum,
                            ...context
                        });

                        for (let j = 0; j < chunk.length; j++) {
                            this.events.emit('artifact:candidate', {
                                buffer: chunk[j].buffer,
                                index: startNum + j,
                                originalIndex: startNum + j,
                                ...context
                            });
                        }

                        return { ...result, startNum, chunk, success: true };
                    } catch (e) {
                        return { success: false, startNum, chunk, spriteBuffer: Buffer.alloc(0), validIndices: [] };
                    }
                });

                const sprites = (await Promise.all(spritePromises)).filter(s => s.success);
                
                const imageContentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
                
                for (const sprite of sprites) {
                    const base64Sprite = sprite.spriteBuffer.toString('base64');
                    const dataUrl = `data:image/jpeg;base64,${base64Sprite}`;
                    imageContentParts.push({ type: 'image_url', image_url: { url: dataUrl } });
                }

                return imageContentParts;
            }
        });
    }

    getImageSearch(): ImageSearch {
        return this.imageSearch;
    }
}
