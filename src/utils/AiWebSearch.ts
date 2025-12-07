import OpenAI from 'openai';
import { z } from 'zod';
import { LlmClient } from 'llm-fns';
import { WebSearch, WebSearchResult, WebSearchMode } from '../plugins/web-search/WebSearch.js';
import { ResolvedModelConfig } from '../types.js';
import { ModelRequestNormalizer } from '../core/ModelRequestNormalizer.js';

export class AiWebSearch {
    constructor(
        private webSearch: WebSearch,
        private llm: LlmClient
    ) {}

    async process(
        row: Record<string, any>,
        config: {
            query?: string;
            queryConfig?: ResolvedModelConfig;
            selectConfig?: ResolvedModelConfig;
            compressConfig?: ResolvedModelConfig;
            limit: number;
            mode: WebSearchMode;
            queryCount: number;
            paginate: boolean;
            pageSize: number;
            maxPages: number;
            dedupeStrategy: 'none' | 'domain' | 'url';
        }
    ): Promise<{ contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[], data: WebSearchResult[] }> {
        
        // 1. Determine Queries
        const queries: string[] = [];
        if (config.query) {
            queries.push(config.query);
        }

        if (config.queryConfig) {
            console.log(`[AiWebSearch] Generating search queries...`);
            const QuerySchema = z.object({
                queries: z.array(z.string()).min(1).max(config.queryCount).describe("Search queries to find the requested information")
            });

            const request = ModelRequestNormalizer.normalize(config.queryConfig, row);
            const response = await this.llm.promptZod(request.messages, QuerySchema, {
                model: request.model,
                ...request.options
            });
            queries.push(...response.queries);
            console.log(`[AiWebSearch] Generated queries: ${response.queries.join(', ')}`);
        }

        if (queries.length === 0) return { contentParts: [], data: [] };

        // 2. Execute Search (Loop over queries + Pagination)
        const allResults: WebSearchResult[] = [];
        const seenKeys = new Set<string>();

        // Helper to determine dedupe key
        const getDedupeKey = (result: WebSearchResult): string | null => {
            if (config.dedupeStrategy === 'domain') {
                try {
                    return new URL(result.link).hostname;
                } catch (e) {
                    return result.link; // Fallback if URL parse fails
                }
            }
            if (config.dedupeStrategy === 'url') {
                return result.link;
            }
            return null;
        };

        for (const q of queries) {
            // Stop if we've reached the global limit
            if (allResults.length >= config.limit) break;

            let page = 1;
            const maxPages = config.paginate ? config.maxPages : 1;
            // If not paginating, we use the limit as the fetch size (up to 100 max usually supported by Serper)
            // If paginating, we use pageSize.
            const fetchSize = config.paginate ? config.pageSize : config.limit;

            while (page <= maxPages) {
                // Stop if we've reached the global limit
                if (allResults.length >= config.limit) break;

                const results = await this.webSearch.search(q, fetchSize, page);
                
                if (results.length === 0) {
                    // No more results for this query
                    break;
                }

                // --- Batch Selection (Per Page) ---
                let selectedFromPage = results;
                
                if (config.selectConfig) {
                    console.log(`[AiWebSearch] Selecting relevant results from page ${page} (${results.length} items)...`);
                    
                    // Prepare list for LLM
                    const listText = results.map((r, i) => `[${i}] ${r.title}\n    Link: ${r.link}\n    Snippet: ${r.snippet}`).join('\n\n');
                    
                    const SelectionSchema = z.object({
                        selected_indices: z.array(z.number()).describe("Indices of the most relevant results"),
                        reasoning: z.string()
                    });

                    const request = ModelRequestNormalizer.normalize(config.selectConfig, row, [{ type: 'text', text: listText }]);
                    
                    const response = await this.llm.promptZod(request.messages, SelectionSchema, {
                        model: request.model,
                        ...request.options
                    });

                    selectedFromPage = response.selected_indices
                        .map(i => results[i])
                        .filter(r => r !== undefined);
                    
                    console.log(`[AiWebSearch] Selected ${selectedFromPage.length} results from page ${page}.`);
                }

                // --- Dedupe & Accumulate ---
                let addedCount = 0;
                for (const result of selectedFromPage) {
                    if (allResults.length >= config.limit) break;

                    const key = getDedupeKey(result);
                    
                    if (key) {
                        if (seenKeys.has(key)) {
                            continue; // Skip duplicate
                        }
                        seenKeys.add(key);
                    }
                    
                    allResults.push(result);
                    addedCount++;
                }

                // If we didn't add anything new from this page, and we are deduping, 
                // it might mean we are looping through redundant pages (e.g. same domain results).
                // However, we should probably keep going until maxPages or empty results 
                // because the next page might have a new domain.
                
                if (!config.paginate) break; // Only run once if pagination is disabled
                page++;
            }
        }

        if (allResults.length === 0) return { contentParts: [{ type: 'text', text: "No results found." }], data: [] };

        // 3. Fetch Content & Compress (On the final unique list)
        const finalOutputs: string[] = [];
        const processedResults: WebSearchResult[] = [];

        for (const result of allResults) {
            let content = "";
            
            if (config.mode !== 'none') {
                console.log(`[AiWebSearch] Fetching content for: ${result.title}`);
                const rawContent = await this.webSearch.fetchContent(result.link, config.mode);
                content = rawContent || result.snippet || "";
            } else {
                content = result.snippet || "";
            }

            // Compression
            if (config.compressConfig) {
                console.log(`[AiWebSearch] Compressing content for: ${result.title}`);
                
                // Truncate content if too large for context window (naive check)
                const truncatedContent = content.substring(0, 15000); 

                const request = ModelRequestNormalizer.normalize(config.compressConfig, row, [
                    { type: 'text', text: `Title: ${result.title}\nLink: ${result.link}\n\nContent:\n${truncatedContent}` }
                ]);

                // We expect a string back
                const response = await this.llm.prompt({
                    messages: request.messages,
                    model: request.model,
                    ...request.options
                });

                const summary = response.choices[0].message.content || "";
                content = summary;
                finalOutputs.push(`Source: ${result.title} (${result.link})\nSummary:\n${summary}`);
            } else {
                finalOutputs.push(`Source: ${result.title} (${result.link})\nContent:\n${content}`);
            }

            processedResults.push({
                ...result,
                content
            });
        }

        const text = finalOutputs.length > 0
            ? `\n--- Web Search Results ---\n${finalOutputs.join('\n\n')}\n--------------------------\n`
            : "No results found.";

        return { 
            contentParts: [{ type: 'text', text }], 
            data: processedResults 
        };
    }
}
