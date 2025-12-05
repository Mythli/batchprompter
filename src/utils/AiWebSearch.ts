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
        }
    ): Promise<{ contentParts: string[], raw: WebSearchResult[] }> {
        
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

        if (queries.length === 0) return { contentParts: [], raw: [] };

        // 2. Execute Search
        const allResults: WebSearchResult[] = [];
        const seenLinks = new Set<string>();

        for (const q of queries) {
            const results = await this.webSearch.search(q, config.limit);
            for (const r of results) {
                if (!seenLinks.has(r.link)) {
                    seenLinks.add(r.link);
                    allResults.push(r);
                }
            }
        }

        if (allResults.length === 0) return { contentParts: ["No results found."], raw: [] };

        // 3. Selection (Optional)
        let selectedResults = allResults;
        if (config.selectConfig) {
            console.log(`[AiWebSearch] Selecting relevant results from ${allResults.length} candidates...`);
            
            // Prepare list for LLM
            const listText = allResults.map((r, i) => `[${i}] ${r.title}\n    Link: ${r.link}\n    Snippet: ${r.snippet}`).join('\n\n');
            
            const SelectionSchema = z.object({
                selected_indices: z.array(z.number()).describe("Indices of the most relevant results"),
                reasoning: z.string()
            });

            const request = ModelRequestNormalizer.normalize(config.selectConfig, row, [{ type: 'text', text: listText }]);
            
            const response = await this.llm.promptZod(request.messages, SelectionSchema, {
                model: request.model,
                ...request.options
            });

            selectedResults = response.selected_indices
                .map(i => allResults[i])
                .filter(r => r !== undefined);
            
            console.log(`[AiWebSearch] Selected ${selectedResults.length} results.`);
        }

        // Enforce limit after selection
        selectedResults = selectedResults.slice(0, config.limit);

        // 4. Fetch Content & Compress
        const finalOutputs: string[] = [];
        const processedResults: WebSearchResult[] = [];

        for (const result of selectedResults) {
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

        return { contentParts: finalOutputs, raw: processedResults };
    }
}
