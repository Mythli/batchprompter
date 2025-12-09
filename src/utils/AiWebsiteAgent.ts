import { z } from 'zod';
import PQueue from 'p-queue';
import TurndownService from 'turndown';
import { LlmClient } from 'llm-fns';
import { PuppeteerHelper } from './puppeteer/PuppeteerHelper.js';
import { PuppeteerPageHelper, LinkData } from './puppeteer/PuppeteerPageHelper.js';
import { compressHtml } from './compressHtml.js';
import { ResolvedModelConfig } from '../types.js';
import { ModelRequestNormalizer } from '../core/ModelRequestNormalizer.js';

export interface AiWebsiteAgentOptions {
    budget: number;
    batchSize: number;
    navigatorConfig: ResolvedModelConfig;
    extractConfig: ResolvedModelConfig;
    mergeConfig: ResolvedModelConfig;
    row: Record<string, any>;
}

interface ScrapedPageResult {
    url: string;
    data: any;
    links: LinkData[];
}

export class AiWebsiteAgent {
    
    constructor(
        private puppeteerHelper: PuppeteerHelper,
        private llm: LlmClient,
        private puppeteerQueue: PQueue
    ) {}

    private async getPageContent(url: string): Promise<{ html: string, markdown: string, links: LinkData[] }> {
        return this.puppeteerQueue.add(async () => {
            const pageHelper = await this.puppeteerHelper.getPageHelper();
            try {
                return await pageHelper.navigateAndCache(
                    url,
                    async (ph) => {
                        const html = await ph.getFinalHtml();
                        const links = await ph.extractLinksWithText();

                        const compressed = compressHtml(html);
                        const turndownService = new TurndownService();
                        turndownService.remove(['script', 'style', 'noscript', 'iframe']);
                        const markdown = turndownService.turndown(compressed);

                        return { html, markdown, links };
                    },
                    {
                        dismissCookies: false, // No need to dismiss cookies in HTML-only mode
                        htmlOnly: true, // Enforce HTML-only mode for performance
                        cacheKey: `website-agent-v1:${url}`,
                        ttl: 24 * 60 * 60 * 1000 // 24 hours
                    }
                );
            } finally {
                await pageHelper.close();
            }
        }) as Promise<{ html: string, markdown: string, links: LinkData[] }>;
    }

    private async extractDataFromMarkdown(
        url: string,
        markdown: string,
        schema: any, // JSON Schema Object
        config: ResolvedModelConfig,
        row: Record<string, any>
    ): Promise<any> {
        const truncatedMarkdown = markdown.substring(0, 20000);

        const context = { ...row, url, truncatedMarkdown };
        const request = ModelRequestNormalizer.normalize(config, context);

        return await this.llm.promptJson(
            request.messages,
            schema,
            { model: request.model, ...request.options }
        );
    }

    private async decideNextSteps(
        currentData: any,
        visitedUrls: Set<string>,
        knownLinks: LinkData[],
        budget: number,
        batchSize: number,
        schema: any,
        config: ResolvedModelConfig,
        row: Record<string, any>
    ): Promise<{ nextUrls: string[], isDone: boolean }> {
        
        // Filter known links to exclude visited ones
        const candidates = knownLinks
            .filter(l => !visitedUrls.has(l.href) && l.href.startsWith('http'))
            .slice(0, 50); // Limit candidates to avoid token overflow

        if (candidates.length === 0) {
            return { nextUrls: [], isDone: true };
        }

        const linksText = candidates
            .map((l, i) => `[${i}] ${l.href} (Text: "${l.text}")`)
            .join('\n');

        const NavigatorSchema = z.object({
            next_urls: z.array(z.string()).describe("List of URLs to visit next. Must be exact matches from the available links."),
            reasoning: z.string().describe("Reasoning for visiting these pages or deciding to stop."),
            is_done: z.boolean().describe("True if sufficient information has been gathered.")
        });

        const context = {
            ...row,
            schemaDescription: JSON.stringify(schema),
            visitedCount: visitedUrls.size,
            budget,
            batchSize,
            currentData: JSON.stringify(currentData, null, 2),
            linksText
        };

        const request = ModelRequestNormalizer.normalize(config, context);

        const response = await this.llm.promptZod(
            request.messages,
            NavigatorSchema,
            { model: request.model, ...request.options }
        );

        // Validate returned URLs exist in candidates (hallucination check)
        const validNextUrls = response.next_urls.filter(url => 
            candidates.some(c => c.href === url)
        );

        return {
            nextUrls: validNextUrls.slice(0, batchSize),
            isDone: response.is_done
        };
    }

    private async mergeResults(
        results: any[],
        schema: any,
        config: ResolvedModelConfig,
        row: Record<string, any>
    ): Promise<any> {
        if (results.length === 0) return {};
        if (results.length === 1) return results[0];

        const context = { ...row, jsonObjects: JSON.stringify(results, null, 2) };
        const request = ModelRequestNormalizer.normalize(config, context);

        return await this.llm.promptJson(
            request.messages,
            schema,
            { model: request.model, ...request.options }
        );
    }

    async scrapeIterative(
        initialUrl: string,
        schema: any,
        options: AiWebsiteAgentOptions
    ): Promise<any> {
        let budget = options.budget;
        const visitedUrls = new Set<string>();
        const knownLinks: LinkData[] = [];
        const extractedData: any[] = [];
        
        // 1. Initial Page
        console.log(`[AiWebsiteAgent] Starting at ${initialUrl} (Budget: ${budget})`);
        
        try {
            const initialPage = await this.getPageContent(initialUrl);
            visitedUrls.add(initialUrl);
            budget--;

            const initialData = await this.extractDataFromMarkdown(
                initialUrl,
                initialPage.markdown,
                schema,
                options.extractConfig,
                options.row
            );
            
            extractedData.push(initialData);
            knownLinks.push(...initialPage.links);
        } catch (e) {
            console.error(`[AiWebsiteAgent] Failed to scrape initial URL ${initialUrl}:`, e);
            return {}; // Fail early if initial page fails? Or return empty?
        }

        // 2. Iterative Loop
        while (budget > 0) {
            // Merge current findings to give context to Navigator
            // We do a "soft merge" or just pass the array if it's small enough. 
            // For robustness, let's run the merge model to get a clean state.
            // Optimization: If we have many results, maybe just pass the last merged state + new data?
            // For now, let's merge all.
            const currentMerged = await this.mergeResults(extractedData, schema, options.mergeConfig, options.row);

            // Decide Next Steps
            const { nextUrls, isDone } = await this.decideNextSteps(
                currentMerged,
                visitedUrls,
                knownLinks,
                budget,
                options.batchSize,
                schema,
                options.navigatorConfig,
                options.row
            );

            if (isDone || nextUrls.length === 0) {
                console.log(`[AiWebsiteAgent] Stopping. Done: ${isDone}, Next URLs: ${nextUrls.length}`);
                break;
            }

            console.log(`[AiWebsiteAgent] Next batch: ${nextUrls.join(', ')}`);

            // Execute Batch
            const batchPromises = nextUrls.map(async (url) => {
                if (visitedUrls.has(url)) return null;
                visitedUrls.add(url);
                
                try {
                    const page = await this.getPageContent(url);
                    const data = await this.extractDataFromMarkdown(
                        url,
                        page.markdown,
                        schema,
                        options.extractConfig,
                        options.row
                    );
                    return { url, data, links: page.links };
                } catch (e) {
                    console.warn(`[AiWebsiteAgent] Failed to scrape ${url}:`, e);
                    return null;
                }
            });

            const batchResults = await Promise.all(batchPromises);
            const successfulResults = batchResults.filter(r => r !== null) as ScrapedPageResult[];

            // Update State
            budget -= successfulResults.length; // Only deduct for attempted/successful pages
            
            for (const res of successfulResults) {
                extractedData.push(res.data);
                knownLinks.push(...res.links);
            }
        }

        // 3. Final Merge
        console.log(`[AiWebsiteAgent] Final merge of ${extractedData.length} results...`);
        return await this.mergeResults(extractedData, schema, options.mergeConfig, options.row);
    }

    // Legacy method kept for compatibility if needed, or redirected
    async scrape(url: string, schema: any, options: any): Promise<any> {
        return this.scrapeIterative(url, schema, options);
    }
}
