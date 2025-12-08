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
    depth?: number;
    maxLinks?: number;
    linksConfig: ResolvedModelConfig;
    extractConfig: ResolvedModelConfig;
    mergeConfig: ResolvedModelConfig;
    row: Record<string, any>;
}

export class AiWebsiteAgent {
    
    constructor(
        private puppeteerHelper: PuppeteerHelper,
        private llm: LlmClient,
        private puppeteerQueue: PQueue
    ) {}

    private async extractRelevantLinks(
        baseUrl: string,
        links: LinkData[],
        maxLinks: number,
        config: ResolvedModelConfig,
        row: Record<string, any>
    ): Promise<string[]> {
        const linksText = links
            .filter(l => l.text.length > 0)
            .slice(0, 200)
            .map(link => `URL: ${link.href}\nText: ${link.text}`)
            .join('\n\n');

        const LinkSchema = z.object({
            relevant_urls: z.array(z.string()).max(maxLinks).describe("List of relevant absolute URLs found on the page.")
        });

        // Prepare context for template rendering
        const context = { ...row, baseUrl, linksText };

        // Use Normalizer to build request
        // Note: The prompt in config.promptParts likely contains {{baseUrl}} and {{linksText}}
        // We need to re-render the prompt parts with this new context.
        // Since ModelRequestNormalizer renders templates, we pass the merged context.
        
        const request = ModelRequestNormalizer.normalize(config, context);

        const response = await this.llm.promptZod(
            request.messages,
            LinkSchema,
            { model: request.model, ...request.options }
        );

        return response.relevant_urls;
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
                        dismissCookies: true,
                        htmlOnly: true,
                        cacheKey: `website-agent-v1:${url}`,
                        ttl: 24 * 60 * 60 * 1000 // 24 hours
                    }
                );
            } finally {
                await pageHelper.close();
            }
        }) as Promise<{ html: string, markdown: string, links: LinkData[] }>;
    }

    async scrape(
        url: string,
        schema: any, // JSON Schema Object
        options: AiWebsiteAgentOptions
    ): Promise<any> {
        const depth = options.depth ?? 0;
        const maxLinks = options.maxLinks ?? 3;
        
        console.log(`[AiWebsiteAgent] Scraping ${url} (Depth: ${depth})...`);

        // 1. Fetch Main Page (Sequential, required for everything)
        const mainPage = await this.getPageContent(url);

        // 2. Define Tasks
        
        // Task A: Extract data from main page
        const mainDataTask = this.extractDataFromMarkdown(
            url, 
            mainPage.markdown, 
            schema, 
            options.extractConfig, 
            options.row
        );

        // Task B: Find and scrape sub-pages (if depth > 0)
        const subPagesTask = (async () => {
            if (depth <= 0) return [];

            console.log(`[AiWebsiteAgent] Analyzing links on ${url}...`);
            const relevantUrls = await this.extractRelevantLinks(
                url, 
                mainPage.links, 
                maxLinks, 
                options.linksConfig, 
                options.row
            );
            
            const uniqueUrls = relevantUrls.filter(u => u !== url && u.startsWith('http'));
            console.log(`[AiWebsiteAgent] Found sub-pages: ${uniqueUrls.join(', ')}`);

            const subPagePromises = uniqueUrls.map(async (subUrl) => {
                try {
                    const subPage = await this.getPageContent(subUrl);
                    return await this.extractDataFromMarkdown(
                        subUrl, 
                        subPage.markdown, 
                        schema, 
                        options.extractConfig, 
                        options.row
                    );
                } catch (e) {
                    console.warn(`[AiWebsiteAgent] Failed to scrape sub-page ${subUrl}:`, e);
                    return {};
                }
            });

            return Promise.all(subPagePromises);
        })();

        // 3. Execute with Safety (Promise.allSettled)
        // This ensures that if one task fails (e.g. link extraction), we still wait for the other (main data extraction)
        // to complete or fail, preventing unhandled promise rejections.
        const results = await Promise.allSettled([mainDataTask, subPagesTask]);

        // 4. Check for Errors
        const rejected = results.find(r => r.status === 'rejected');
        if (rejected) {
            // If one failed, we throw the error so ActionRunner catches it for this row.
            throw (rejected as PromiseRejectedResult).reason;
        }

        // 5. Retrieve Results
        const mainData = (results[0] as PromiseFulfilledResult<any>).value;
        const subPagesData = (results[1] as PromiseFulfilledResult<any[]>).value;
        
        const allData = [mainData, ...subPagesData];

        if (allData.length > 1) {
             console.log(`[AiWebsiteAgent] Merging ${allData.length} data sources...`);

             const context = { ...options.row, jsonObjects: JSON.stringify(allData, null, 2) };
             const request = ModelRequestNormalizer.normalize(options.mergeConfig, context);

             return await this.llm.promptJson(
                 request.messages,
                 schema,
                 { model: request.model, ...request.options }
             );
        }

        return mainData;
    }
}
