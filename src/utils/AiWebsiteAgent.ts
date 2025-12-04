import { z } from 'zod';
import PQueue from 'p-queue';
import TurndownService from 'turndown';
import { LlmClient } from 'llm-fns';
import { PuppeteerHelper } from './puppeteer/PuppeteerHelper.js';
import { PuppeteerPageHelper, LinkData } from './puppeteer/PuppeteerPageHelper.js';
import { compressHtml } from './compressHtml.js';

export interface AiWebsiteAgentOptions {
    depth?: number;
    maxLinks?: number;
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
        maxLinks: number
    ): Promise<string[]> {
        const linksText = links
            .filter(l => l.text.length > 0)
            .slice(0, 200)
            .map(link => `URL: ${link.href}\nText: ${link.text}`)
            .join('\n\n');

        const LinkSchema = z.object({
            relevant_urls: z.array(z.string()).max(maxLinks).describe("List of relevant absolute URLs found on the page.")
        });

        const prompt = `You are a web scraper assistant. Your task is to identify the most relevant URLs for scraping additional company information (like About Us, Contact, Imprint, Team, Products) from the provided list of links found on the website ${baseUrl}.

Base URL: ${baseUrl}

List of links:
${linksText}`;

        const response = await this.llm.promptZod(
            [{ role: 'user', content: prompt }],
            LinkSchema,
            { model: 'gpt-4o' }
        );

        return response.relevant_urls;
    }

    private async extractDataFromMarkdown(
        url: string,
        markdown: string,
        schema: any // JSON Schema Object
    ): Promise<any> {
        const truncatedMarkdown = markdown.substring(0, 20000);

        const prompt = `You are given the website content of ${url} (converted to markdown). Your primary goal is to extract information from this content to accurately populate the provided JSON schema.

Website content:
${truncatedMarkdown}`;

        return await this.llm.promptJson(
            [{ role: 'user', content: prompt }],
            schema,
            { model: 'gpt-4o' }
        );
    }

    private async getPageContent(url: string): Promise<{ html: string, markdown: string, links: LinkData[] }> {
        return this.puppeteerQueue.add(async () => {
            const pageHelper = await this.puppeteerHelper.getPageHelper();
            try {
                await pageHelper.navigateToUrl(url, {
                    dismissCookies: true,
                    htmlOnly: true
                });
                
                const html = await pageHelper.getFinalHtml();
                const links = await pageHelper.extractLinksWithText();
                
                const compressed = compressHtml(html);
                const turndownService = new TurndownService();
                turndownService.remove(['script', 'style', 'noscript', 'iframe', 'svg']);
                const markdown = turndownService.turndown(compressed);

                return { html, markdown, links };
            } finally {
                await pageHelper.close();
            }
        }) as Promise<{ html: string, markdown: string, links: LinkData[] }>;
    }

    async scrape(
        url: string,
        schema: any, // JSON Schema Object
        options: AiWebsiteAgentOptions = {}
    ): Promise<any> {
        const depth = options.depth ?? 0;
        const maxLinks = options.maxLinks ?? 3;

        console.log(`[AiWebsiteAgent] Scraping ${url} (Depth: ${depth})...`);

        const mainPage = await this.getPageContent(url);
        const mainDataPromise = this.extractDataFromMarkdown(url, mainPage.markdown, schema);

        let subPagesDataPromises: Promise<any>[] = [];

        if (depth > 0) {
            console.log(`[AiWebsiteAgent] Analyzing links on ${url}...`);
            const relevantUrls = await this.extractRelevantLinks(url, mainPage.links, maxLinks);
            const uniqueUrls = relevantUrls.filter(u => u !== url && u.startsWith('http'));
            console.log(`[AiWebsiteAgent] Found sub-pages: ${uniqueUrls.join(', ')}`);

            subPagesDataPromises = uniqueUrls.map(async (subUrl) => {
                try {
                    const subPage = await this.getPageContent(subUrl);
                    return await this.extractDataFromMarkdown(subUrl, subPage.markdown, schema);
                } catch (e) {
                    console.warn(`[AiWebsiteAgent] Failed to scrape sub-page ${subUrl}:`, e);
                    return {};
                }
            });
        }

        const [mainData, ...subPagesData] = await Promise.all([mainDataPromise, ...subPagesDataPromises]);
        const allData = [mainData, ...subPagesData];
        
        if (allData.length > 1) {
             console.log(`[AiWebsiteAgent] Merging ${allData.length} data sources...`);
             const mergePrompt = `You are a data consolidation expert. Merge the following JSON objects extracted from different pages of the same website into a single comprehensive object adhering to the schema.
             
             Objects:
             ${JSON.stringify(allData, null, 2)}`;
             
             return await this.llm.promptJson(
                 [{ role: 'user', content: mergePrompt }],
                 schema,
                 { model: 'gpt-4o' }
             );
        }

        return mainData;
    }
}
