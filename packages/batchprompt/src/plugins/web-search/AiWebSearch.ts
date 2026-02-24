import OpenAI from 'openai';
import { z } from 'zod';
import { EventEmitter } from 'eventemitter3';
import { BoundLlmClient } from '../../BoundLlmClient.js';
import { WebSearch, WebSearchResult, WebSearchMode } from './WebSearch.js';
import { LlmListSelector } from '../../utils/LlmListSelector.js';
import { truncateSingleMessage } from 'llm-fns';

export class AiWebSearch {
    public readonly events = new EventEmitter();

    constructor(
        private webSearch: WebSearch,
        private queryLlm?: BoundLlmClient,
        private selector?: LlmListSelector,
        private compressLlm?: BoundLlmClient
    ) {}

    async process(
        row: Record<string, any>,
        config: {
            query?: string;
            limit: number;
            chunkSize: number;
            mode: WebSearchMode;
            queryCount: number;
            maxPages: number;
            dedupeStrategy: 'none' | 'domain' | 'url';
            gl?: string;
            hl?: string;
            scrapedCache?: Set<string>;
        }
    ): Promise<{ contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[], data: WebSearchResult[] }> {

        // 1. Generate Queries
        const queries: string[] = [];
        if (config.query) {
            queries.push(config.query);
        }

        if (this.queryLlm) {
            console.log(`[AiWebSearch] Generating search queries...`);
            const QuerySchema = z.object({
                queries: z.array(z.string()).min(1).max(config.queryCount).describe("Search queries to find the requested information")
            });

            const response = await this.queryLlm.promptZod(QuerySchema);
            queries.push(...response.queries);
            console.log(`[AiWebSearch] Generated queries: ${response.queries.join(', ')}`);

            this.events.emit('query:generated', { queries: response.queries });
        } else if (queries.length > 0) {
             this.events.emit('query:generated', { queries });
        }

        if (queries.length === 0) return { contentParts: [], data: [] };

        // 2. Scatter (Parallel Fetch ONLY)
        const tasks: { query: string; page: number }[] = [];
        for (const q of queries) {
            for (let p = 1; p <= config.maxPages; p++) {
                tasks.push({ query: q, page: p });
            }
        }

        console.log(`[AiWebSearch] Executing ${tasks.length} search tasks in parallel...`);

        const pageResults = await Promise.all(tasks.map(async ({ query, page }) => {
            try {
                // We still fetch 10 results per page from the search engine (standard page size)
                const results = await this.webSearch.search(query, 10, page, config.gl, config.hl);
                
                this.events.emit('search:result', {
                    query,
                    page,
                    results
                });

                return results;
            } catch (e) {
                console.warn(`[AiWebSearch] Task failed for "${query}" page ${page}:`, e);
                return [];
            }
        }));

        // 3. Gather & Dedupe
        const allRawResults = pageResults.flat();
        const uniqueResults: WebSearchResult[] = [];
        const seenKeys = new Set<string>();

        const getDedupeKey = (result: WebSearchResult): string | null => {
            if (config.dedupeStrategy === 'domain') {
                try {
                    const hostname = new URL(result.link).hostname;
                    // Normalize: remove www. and lowercase
                    return hostname.replace(/^www\./, '').toLowerCase();
                } catch (e) {
                    return result.link;
                }
            }
            if (config.dedupeStrategy === 'url') {
                try {
                    const url = new URL(result.link);
                    // Normalize: ignore protocol, ignore www, ignore trailing slash
                    const host = url.hostname.replace(/^www\./, '').toLowerCase();
                    const path = url.pathname.replace(/\/$/, '');
                    const search = url.search; // Keep query params
                    return `${host}${path}${search}`;
                } catch (e) {
                    return result.link;
                }
            }
            return null;
        };

        for (const result of allRawResults) {
            const key = getDedupeKey(result);
            if (key) {
                // Check local row cache
                if (seenKeys.has(key)) continue;
                // Check global step cache (from other rows)
                if (config.scrapedCache?.has(key)) continue;
                
                seenKeys.add(key);
            }
            uniqueResults.push(result);
        }

        console.log(`[AiWebSearch] Gathered ${allRawResults.length} raw results, deduplicated down to ${uniqueResults.length}.`);

        if (uniqueResults.length === 0) return { contentParts: [{ type: 'text', text: "No results found." }], data: [] };

        // 4. Chunking & Local Selection (Map)
        let mapSurvivors: WebSearchResult[] = [];

        if (this.selector) {
            console.log(`[AiWebSearch] Running local selection on ${uniqueResults.length} results in chunks of ${config.chunkSize}...`);
            
            const chunks: WebSearchResult[][] = [];
            for (let i = 0; i < uniqueResults.length; i += config.chunkSize) {
                chunks.push(uniqueResults.slice(i, i + config.chunkSize));
            }

            const chunkResults = await Promise.all(chunks.map(async (chunk, chunkIndex) => {
                return await this.selector!.select(chunk, {
                    maxSelected: chunk.length, // Keep all good ones locally
                    formatContent: async (items) => {
                        const listText = items.map((r, i) => `[${i}] ${r.title}\n    Link: ${r.link}\n    Snippet: ${r.snippet}`).join('\n\n');
                        return [{ type: 'text', text: `Search results (Chunk ${chunkIndex + 1}):\n\n${listText}` }];
                    },
                    promptPreamble: "Select the indices of the most relevant results.",
                    indexOffset: 0,
                    onDecision: async (decision, items) => {
                        this.events.emit('selection:map', {
                            chunkIndex,
                            results: items,
                            selection: { indices: decision.selected_indices, reasoning: decision.reasoning }
                        });
                    }
                });
            }));

            mapSurvivors = chunkResults.flat();
        } else {
            // No selector, all deduplicated results survive the map phase
            mapSurvivors = uniqueResults;
        }

        // 5. Reduce (Global Selection)
        let finalSelection = mapSurvivors;

        if (this.selector && mapSurvivors.length > config.limit) {
            console.log(`[AiWebSearch] Reducing ${mapSurvivors.length} survivors to limit ${config.limit}...`);

            finalSelection = await this.selector.select(mapSurvivors, {
                maxSelected: config.limit,
                formatContent: async (items) => {
                    const listText = items.map((r, i) => `[${i}] ${r.title}\n    Link: ${r.link}\n    Snippet: ${r.snippet}`).join('\n\n');
                    return [{ type: 'text', text: `Combined search results:\n\n${listText}` }];
                },
                promptPreamble: `Select the indices of the top ${config.limit} most relevant results.`,
                indexOffset: 0,
                onDecision: async (decision, items) => {
                    this.events.emit('selection:reduce', {
                        input: items,
                        selection: { indices: decision.selected_indices, reasoning: decision.reasoning }
                    });
                }
            });
        } else if (mapSurvivors.length > config.limit) {
            // Simple slice if no LLM selection configured but limit exceeded
            finalSelection = mapSurvivors.slice(0, config.limit);
        }

        if (finalSelection.length === 0) return { contentParts: [{ type: 'text', text: "No results found." }], data: [] };

        // 6. Enrich (Parallel Fetch & Compress)
        console.log(`[AiWebSearch] Enriching ${finalSelection.length} results...`);

        const finalOutputs: string[] = [];
        const processedResults: WebSearchResult[] = [];

        await Promise.all(finalSelection.map(async (result) => {
            // Register the final selected result in the global cache so future rows ignore it
            const key = getDedupeKey(result);
            if (key && config.scrapedCache) {
                config.scrapedCache.add(key);
            }

            let content = "";
            let rawContent = "";

            if (config.mode !== 'none') {
                rawContent = await this.webSearch.fetchContent(result.link, config.mode);
                content = rawContent || result.snippet || "";
            } else {
                content = result.snippet || "";
                rawContent = content;
            }

            if (this.compressLlm) {
                const message: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
                    role: 'user',
                    content: `Title: ${result.title}\nLink: ${result.link}\n\nContent:\n${content}`
                };
                const truncatedMessage = truncateSingleMessage(message, 15000);
                const truncatedContent = truncatedMessage.content;
                const contentToCompress = Array.isArray(truncatedContent)
                    ? truncatedContent
                    : [{ type: 'text', text: truncatedContent || '' }];

                const summary = await this.compressLlm.promptText({ suffix: contentToCompress as any });
                content = summary;
            }

            this.events.emit('content:enrich', {
                url: result.link,
                rawContent: rawContent,
                compressedContent: content
            });

            let domain: string | undefined;
            try {
                domain = new URL(result.link).hostname;
            } catch (e) {}

            processedResults.push({
                ...result,
                content,
                domain
            });
        }));

        // Sort to maintain some deterministic order (optional, but good for logs)
        // We can't easily preserve rank from search engines after parallel fetch without tracking indices,
        // but processedResults order is non-deterministic due to Promise.all.
        // Let's just format the output based on the processed list.

        for (const result of processedResults) {
             finalOutputs.push(`Source: ${result.title} (${result.link})\nContent:\n${result.content}`);
        }

        const text = finalOutputs.length > 0
            ? `\n--- Web Search Results ---\n${finalOutputs.join('\n\n')}\n--------------------------\n`
            : "No results found.";

        this.events.emit('result:selected', { results: processedResults });

        return {
            contentParts: [{ type: 'text', text }],
            data: processedResults
        };
    }
}
