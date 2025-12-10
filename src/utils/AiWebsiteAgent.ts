import { z } from 'zod';
import PQueue from 'p-queue';
import TurndownService from 'turndown';
import { LlmClient } from 'llm-fns';
import { PuppeteerHelper } from './puppeteer/PuppeteerHelper.js';
import { LinkData } from './puppeteer/PuppeteerPageHelper.js';
import { compressHtml } from './compressHtml.js';

export interface AiWebsiteAgentOptions {
    budget: number;
    batchSize: number;
    row: Record<string, any>;
}

interface ScrapedPageResult {
    url: string;
    data: any;
    links: LinkData[];
}

interface EnrichedLinkData extends LinkData {
    firstSeenOn: string;
}

export class AiWebsiteAgent {
    
    constructor(
        private navigatorLlm: LlmClient,
        private extractLlm: LlmClient,
        private mergeLlm: LlmClient,
        private puppeteerHelper: PuppeteerHelper,
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
                        dismissCookies: false,
                        htmlOnly: true,
                        cacheKey: `website-agent-v1:${url}`,
                        ttl: 24 * 60 * 60 * 1000
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
        schema: any,
        row: Record<string, any>
    ): Promise<any> {
        const truncatedMarkdown = markdown.substring(0, 20000);

        const prompt = `You are given the website content of ${url} (converted to markdown). Your primary goal is to extract information from this content to accurately populate the provided JSON schema.

Website content:
${truncatedMarkdown}`;

        const messages = [{ role: 'user' as const, content: prompt }];
        
        return await this.extractLlm.promptJson(messages, schema);
    }

    private async decideNextSteps(
        extractedData: any[],
        visitedUrls: Set<string>,
        knownLinks: Map<string, EnrichedLinkData>,
        budget: number,
        batchSize: number,
        row: Record<string, any>
    ): Promise<{ nextUrls: string[], isDone: boolean }> {
        
        const candidates = Array.from(knownLinks.values())
            .filter(l => !visitedUrls.has(l.href) && l.href.startsWith('http'))
            .slice(0, 50);

        if (candidates.length === 0) {
            return { nextUrls: [], isDone: true };
        }

        const linksText = candidates
            .map((l, i) => `[${i}] ${l.href} (Text: "${l.text}", Found on: "${l.firstSeenOn}")`)
            .join('\n');

        const NavigatorSchema = z.object({
            next_urls: z.array(z.string()).describe("List of URLs to visit next. Must be exact matches from the available links."),
            reasoning: z.string().describe("Reasoning for visiting these pages or deciding to stop."),
            is_done: z.boolean().describe("True if sufficient information has been gathered.")
        });

        const prompt = `You are an autonomous web scraper. Your goal is to find information to populate the provided schema.

Status:
- Pages Visited: ${visitedUrls.size}
- Remaining Budget: ${budget}

Current Findings:
${JSON.stringify(extractedData, null, 2)}

Available Links:
${linksText}

Instructions:
1. Analyze the "Current Findings". Do you have sufficient information for all fields in the schema?
2. If yes, set 'is_done' to true.
3. If no, select the most promising URLs from "Available Links" to visit next.
4. You can select up to ${batchSize} links to visit in parallel. Prioritize pages likely to contain missing information (e.g., "About", "Contact", "Team").
5. If no relevant links are left, set 'is_done' to true.`;

        const messages = [{ role: 'user' as const, content: prompt }];

        const response = await this.navigatorLlm.promptZod(messages, NavigatorSchema);

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
        row: Record<string, any>
    ): Promise<any> {
        if (results.length === 0) return {};
        if (results.length === 1) return results[0];

        const prompt = `You are a data consolidation expert. Merge the following JSON objects extracted from different pages of the same website into a single comprehensive object adhering to the schema.

Objects:
${JSON.stringify(results, null, 2)}`;

        const messages = [{ role: 'user' as const, content: prompt }];
        
        return await this.mergeLlm.promptJson(messages, schema);
    }

    async scrapeIterative(
        initialUrl: string,
        schema: any,
        options: AiWebsiteAgentOptions
    ): Promise<any> {
        let budget = options.budget;
        const visitedUrls = new Set<string>();
        const knownLinks = new Map<string, EnrichedLinkData>();
        const extractedData: any[] = [];
        
        console.log(`[AiWebsiteAgent] Starting at ${initialUrl} (Budget: ${budget})`);
        
        try {
            const initialPage = await this.getPageContent(initialUrl);
            visitedUrls.add(initialUrl);
            budget--;

            const initialData = await this.extractDataFromMarkdown(
                initialUrl,
                initialPage.markdown,
                schema,
                options.row
            );
            
            extractedData.push({ url: initialUrl, data: initialData });
            
            for (const link of initialPage.links) {
                if (!knownLinks.has(link.href)) {
                    knownLinks.set(link.href, { ...link, firstSeenOn: initialUrl });
                }
            }
        } catch (e) {
            console.error(`[AiWebsiteAgent] Failed to scrape initial URL ${initialUrl}:`, e);
            return {};
        }

        while (budget > 0) {
            const { nextUrls, isDone } = await this.decideNextSteps(
                extractedData,
                visitedUrls,
                knownLinks,
                budget,
                options.batchSize,
                options.row
            );

            if (isDone || nextUrls.length === 0) {
                console.log(`[AiWebsiteAgent] Stopping. Done: ${isDone}, Next URLs: ${nextUrls.length}`);
                break;
            }

            console.log(`[AiWebsiteAgent] Next batch: ${nextUrls.join(', ')}`);

            const batchPromises = nextUrls.map(async (url) => {
                if (visitedUrls.has(url)) return null;
                visitedUrls.add(url);
                
                try {
                    const page = await this.getPageContent(url);
                    const data = await this.extractDataFromMarkdown(
                        url,
                        page.markdown,
                        schema,
                        options.row
                    );
                    return { url, data, links: page.links };
                } catch (e) {
                    console.warn(`[AiWebsiteAgent] Failed to scrape ${url}:`, e);
                    return null;
                }
            });

            const batchResults = await Promise.allSettled(batchPromises);
            
            const successfulResults = batchResults
                .filter(r => r.status === 'fulfilled')
                .map(r => (r as PromiseFulfilledResult<ScrapedPageResult | null>).value)
                .filter(r => r !== null) as ScrapedPageResult[];

            budget -= successfulResults.length;
            
            for (const res of successfulResults) {
                extractedData.push({ url: res.url, data: res.data });
                
                for (const link of res.links) {
                    if (!knownLinks.has(link.href)) {
                        knownLinks.set(link.href, { ...link, firstSeenOn: res.url });
                    }
                }
            }
        }

        const dataToMerge = extractedData.map(d => d.data);
        
        console.log(`[AiWebsiteAgent] Final merge of ${dataToMerge.length} results...`);
        return await this.mergeResults(dataToMerge, schema, options.row);
    }
}
