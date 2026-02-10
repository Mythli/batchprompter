import { z } from 'zod';
import PQueue from 'p-queue';
import OpenAI from 'openai';
import { EventEmitter } from 'eventemitter3';
import { BoundLlmClient } from '../../BoundLlmClient.js';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';
import { LinkData } from '../../utils/puppeteer/PuppeteerPageHelper.js';
import { compressHtml } from '../../utils/compressHtml.js';
import { truncateSingleMessage } from 'llm-fns';
import { htmlToMarkdown } from '../../utils/htmlToMarkdown.js';

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
    public readonly events = new EventEmitter();

    constructor(
        private navigatorLlm: BoundLlmClient,
        private extractLlm: BoundLlmClient,
        private mergeLlm: BoundLlmClient,
        private puppeteerHelper: PuppeteerHelper,
        private puppeteerQueue: PQueue
    ) {}

    private async getPageContent(url: string): Promise<{ html: string, markdown: string, links: LinkData[] }> {
        return this.puppeteerQueue.add(async () => {
            const pageHelper = await this.puppeteerHelper.getPageHelper();
            try {
                const result = await pageHelper.navigateAndCache(
                    url,
                    async (ph) => {
                        const html = await ph.getFinalHtml();
                        const links = await ph.extractLinksWithText();

                        const compressed = compressHtml(html);
                        const markdown = htmlToMarkdown(compressed);

                        return { html, markdown, links };
                    },
                    {
                        dismissCookies: false,
                        htmlOnly: true,
                        cacheKey: `website-agent-v1:${url}`,
                        ttl: 24 * 60 * 60 * 1000
                    }
                );

                this.events.emit('page:scraped', { url, ...result });
                return result;
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
        const message: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
            role: 'user',
            content: `URL: ${url}\n\nWebsite content (markdown):\n${markdown}`
        };
        const truncatedMessage = truncateSingleMessage(message, 20000);
        const content = truncatedMessage.content;
        const contentParts = Array.isArray(content)
            ? content
            : [{ type: 'text', text: content || '' }];

        const data = await this.extractLlm.promptJson({ suffix: contentParts as any }, schema);

        this.events.emit('data:extracted', { url, data });

        return data;
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

        const statusContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            {
                type: 'text',
                text: `Status:
- Pages Visited: ${visitedUrls.size}
- Remaining Budget: ${budget}

Current Findings:
${JSON.stringify(extractedData, null, 2)}

Available Links:
${linksText}

Select up to ${batchSize} links to visit in parallel. Prioritize pages likely to contain missing information (e.g., "About", "Contact", "Team").
If no relevant links are left or you have sufficient information, set 'is_done' to true.`
            }
        ];

        const response = await this.navigatorLlm.promptZod(
            { suffix: statusContent },
            NavigatorSchema
        );

        this.events.emit('decision:made', {
            findings: extractedData,
            links: Array.from(knownLinks.values()),
            response
        });

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

        const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            { type: 'text', text: `Objects to merge:\n${JSON.stringify(results, null, 2)}` }
        ];

        const merged = await this.mergeLlm.promptJson({ suffix: contentParts }, schema);

        this.events.emit('results:merged', { results, merged });

        return merged;
    }

    async scrapeIterative(
        initialUrl: string,
        extractionSchema: any,
        mergeSchema: any,
        options: AiWebsiteAgentOptions
    ): Promise<any> {
        let budget = options.budget;
        const visitedUrls = new Set<string>();
        const knownLinks = new Map<string, EnrichedLinkData>();
        const extractedData: any[] = [];

        this.events.emit('start', { url: initialUrl, budget });

        try {
            const initialPage = await this.getPageContent(initialUrl);
            visitedUrls.add(initialUrl);
            budget--;

            const initialData = await this.extractDataFromMarkdown(
                initialUrl,
                initialPage.markdown,
                extractionSchema,
                options.row
            );

            extractedData.push({ url: initialUrl, data: initialData });

            for (const link of initialPage.links) {
                if (!knownLinks.has(link.href)) {
                    knownLinks.set(link.href, { ...link, firstSeenOn: initialUrl });
                }
            }
        } catch (e: any) {
            this.events.emit('error', { message: `Failed to scrape initial URL ${initialUrl}: ${e.message}\n${e.stack}` });
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
                this.events.emit('stop', { isDone, nextUrls });
                break;
            }

            this.events.emit('batch', { urls: nextUrls });

            const batchPromises = nextUrls.map(async (url) => {
                if (visitedUrls.has(url)) return null;
                visitedUrls.add(url);

                try {
                    const page = await this.getPageContent(url);
                    const data = await this.extractDataFromMarkdown(
                        url,
                        page.markdown,
                        extractionSchema,
                        options.row
                    );
                    return { url, data, links: page.links };
                } catch (e: any) {
                    this.events.emit('error', { message: `Failed to scrape ${url}: ${e.message}\n${e.stack}` });
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

        return await this.mergeResults(dataToMerge, mergeSchema, options.row);
    }
}
