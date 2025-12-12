import OpenAI from 'openai';
import { z } from 'zod';
import { BoundLlmClient } from '../core/BoundLlmClient.js';
import { WebSearch, WebSearchResult, WebSearchMode } from '../plugins/web-search/WebSearch.js';

export class AiWebSearch {
    constructor(
        private webSearch: WebSearch,
        private queryLlm?: BoundLlmClient,
        private selectLlm?: BoundLlmClient,
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
        }

        if (queries.length === 0) return { contentParts: [], data: [] };

        const allResults: WebSearchResult[] = [];
        const seenKeys = new Set<string>();

        const getDedupeKey = (result: WebSearchResult): string | null => {
            if (config.dedupeStrategy === 'domain') {
                try {
                    return new URL(result.link).hostname;
                } catch (e) {
                    return result.link;
                }
            }
            if (config.dedupeStrategy === 'url') {
                return result.link;
            }
            return null;
        };

        for (const q of queries) {
            if (allResults.length >= config.limit) break;

            let page = 1;
            const maxPages = config.maxPages;
            const fetchSize = 10;

            while (page <= maxPages) {
                if (allResults.length >= config.limit) break;

                const results = await this.webSearch.search(q, fetchSize, page, config.gl, config.hl);
                
                if (results.length === 0) {
                    break;
                }

                let selectedFromPage = results;
                
                if (this.selectLlm) {
                    console.log(`[AiWebSearch] Selecting relevant results from page ${page} (${results.length} items)...`);
                    
                    const listText = results.map((r, i) => `[${i}] ${r.title}\n    Link: ${r.link}\n    Snippet: ${r.snippet}`).join('\n\n');
                    
                    const SelectionSchema = z.object({
                        selected_indices: z.array(z.number()).describe("Indices of the most relevant results"),
                        reasoning: z.string()
                    });

                    const resultsContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
                        { type: 'text', text: `Search results to evaluate:\n\n${listText}` }
                    ];

                    const response = await this.selectLlm.promptZod(
                        { suffix: resultsContent },
                        SelectionSchema
                    );

                    selectedFromPage = response.selected_indices
                        .map(i => results[i])
                        .filter(r => r !== undefined);
                    
                    console.log(`[AiWebSearch] Selected ${selectedFromPage.length} results from page ${page}.`);
                }

                for (const result of selectedFromPage) {
                    if (allResults.length >= config.limit) break;

                    const key = getDedupeKey(result);
                    
                    if (key) {
                        if (seenKeys.has(key)) {
                            continue;
                        }
                        seenKeys.add(key);
                    }
                    
                    allResults.push(result);
                }

                page++;
            }
        }

        if (allResults.length === 0) return { contentParts: [{ type: 'text', text: "No results found." }], data: [] };

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

            if (this.compressLlm) {
                console.log(`[AiWebSearch] Compressing content for: ${result.title}`);
                
                const truncatedContent = content.substring(0, 15000);

                const contentToCompress: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
                    { type: 'text', text: `Title: ${result.title}\nLink: ${result.link}\n\nContent:\n${truncatedContent}` }
                ];

                const summary = await this.compressLlm.promptText({ suffix: contentToCompress });
                content = summary;
                finalOutputs.push(`Source: ${result.title} (${result.link})\nSummary:\n${summary}`);
            } else {
                finalOutputs.push(`Source: ${result.title} (${result.link})\nContent:\n${content}`);
            }

            let domain: string | undefined;
            try {
                domain = new URL(result.link).hostname;
            } catch (e) {
                // ignore invalid URLs
            }

            processedResults.push({
                ...result,
                content,
                domain
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
