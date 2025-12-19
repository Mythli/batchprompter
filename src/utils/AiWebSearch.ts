import OpenAI from 'openai';
import { z } from 'zod';
import { EventEmitter } from 'eventemitter3';
import { BoundLlmClient } from '../core/BoundLlmClient.js';
import { WebSearch, WebSearchResult, WebSearchMode } from '../plugins/web-search/WebSearch.js';
import { LlmListSelector } from './LlmListSelector.js';

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
            mode: WebSearchMode;
            queryCount: number;
            maxPages: number;
            dedupeStrategy: 'none' | 'domain' | 'url';
            gl?: string;
            hl?: string;
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

        // 2. Scatter (Parallel Fetch & Local Select)
        const tasks: { query: string; page: number }[] = [];
        for (const q of queries) {
            for (let p = 1; p <= config.maxPages; p++) {
                tasks.push({ query: q, page: p });
            }
        }

        console.log(`[AiWebSearch] Executing ${tasks.length} search tasks in parallel...`);

        const pageResults = await Promise.all(tasks.map(async ({ query, page }) => {
            try {
                const results = await this.webSearch.search(query, 10, page, config.gl, config.hl);
                if (results.length === 0) return [];

                if (this.selector) {
                    // Local Selection (Map)
                    return await this.selector.select(results, {
                        maxSelected: results.length, // Keep all good ones locally
                        formatContent: async (items) => {
                            const listText = items.map((r, i) => `[${i}] ${r.title}\n    Link: ${r.link}\n    Snippet: ${r.snippet}`).join('\n\n');
                            return [{ type: 'text', text: `Search results for "${query}" (Page ${page}):\n\n${listText}` }];
                        },
                        promptPreamble: "Select the indices of the most relevant results.",
                        indexOffset: 0,
                        onDecision: async (decision, items) => {
                            this.events.emit('search:result', {
                                query,
                                page,
                                results: items,
                                selection: { indices: decision.selected_indices, reasoning: decision.reasoning }
                            });
                        }
                    });
                } else {
                    // No selector, just emit raw results
                    this.events.emit('search:result', {
                        query,
                        page,
                        results
                    });
                }

                return results;
            } catch (e) {
                console.warn(`[AiWebSearch] Task failed for "${query}" page ${page}:`, e);
                return [];
            }
        }));

        // 3. Gather & Dedupe
        const allSurvivors = pageResults.flat();
        const uniqueSurvivors: WebSearchResult[] = [];
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

        for (const result of allSurvivors) {
            const key = getDedupeKey(result);
            if (key) {
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);
            }
            uniqueSurvivors.push(result);
        }

        // 4. Reduce (Global Selection)
        let finalSelection = uniqueSurvivors;
        
        if (this.selector && uniqueSurvivors.length > config.limit) {
            console.log(`[AiWebSearch] Reducing ${uniqueSurvivors.length} survivors to limit ${config.limit}...`);
            
            finalSelection = await this.selector.select(uniqueSurvivors, {
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
        } else if (uniqueSurvivors.length > config.limit) {
            // Simple slice if no LLM selection configured but limit exceeded
            finalSelection = uniqueSurvivors.slice(0, config.limit);
        }

        if (finalSelection.length === 0) return { contentParts: [{ type: 'text', text: "No results found." }], data: [] };

        // 5. Enrich (Parallel Fetch & Compress)
        console.log(`[AiWebSearch] Enriching ${finalSelection.length} results...`);
        
        const finalOutputs: string[] = [];
        const processedResults: WebSearchResult[] = [];

        await Promise.all(finalSelection.map(async (result) => {
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
                const truncatedContent = content.substring(0, 15000);
                const contentToCompress: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
                    { type: 'text', text: `Title: ${result.title}\nLink: ${result.link}\n\nContent:\n${truncatedContent}` }
                ];
                const summary = await this.compressLlm.promptText({ suffix: contentToCompress });
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
