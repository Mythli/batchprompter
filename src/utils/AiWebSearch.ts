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

                if (this.selectLlm) {
                    // Local Selection (Map)
                    const listText = results.map((r, i) => `[${i}] ${r.title}\n    Link: ${r.link}\n    Snippet: ${r.snippet}`).join('\n\n');
                    
                    const SelectionSchema = z.object({
                        selected_indices: z.array(z.number()).describe("Indices of the most relevant results"),
                        reasoning: z.string()
                    });

                    const resultsContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
                        { type: 'text', text: `Search results for "${query}" (Page ${page}):\n\n${listText}` }
                    ];

                    const response = await this.selectLlm.promptZod(
                        { suffix: resultsContent },
                        SelectionSchema
                    );

                    return response.selected_indices
                        .map(i => results[i])
                        .filter(r => r !== undefined);
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
        
        if (this.selectLlm && uniqueSurvivors.length > config.limit) {
            console.log(`[AiWebSearch] Reducing ${uniqueSurvivors.length} survivors to limit ${config.limit}...`);
            
            const listText = uniqueSurvivors.map((r, i) => `[${i}] ${r.title}\n    Link: ${r.link}\n    Snippet: ${r.snippet}`).join('\n\n');
            
            const SelectionSchema = z.object({
                selected_indices: z.array(z.number()).max(config.limit).describe(`Indices of the top ${config.limit} most relevant results`),
                reasoning: z.string()
            });

            const resultsContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
                { type: 'text', text: `Combined search results:\n\n${listText}` }
            ];

            const response = await this.selectLlm.promptZod(
                { suffix: resultsContent },
                SelectionSchema
            );

            finalSelection = response.selected_indices
                .map(i => uniqueSurvivors[i])
                .filter(r => r !== undefined);
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
            
            if (config.mode !== 'none') {
                const rawContent = await this.webSearch.fetchContent(result.link, config.mode);
                content = rawContent || result.snippet || "";
            } else {
                content = result.snippet || "";
            }

            if (this.compressLlm) {
                const truncatedContent = content.substring(0, 15000);
                const contentToCompress: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
                    { type: 'text', text: `Title: ${result.title}\nLink: ${result.link}\n\nContent:\n${truncatedContent}` }
                ];
                const summary = await this.compressLlm.promptText({ suffix: contentToCompress });
                content = summary;
            }

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

        return { 
            contentParts: [{ type: 'text', text }], 
            data: processedResults 
        };
    }
}
