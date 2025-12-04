import OpenAI from 'openai';
import {ZodObject, z} from 'zod';
import TurndownService from 'turndown';
import {merge} from "lodash-es";
import { ZodLlmQuerier, ZodLlmQuerierOptions } from "./zodLlmQuerier.js";
import { EventTracker } from './EventTracker.js';
import { NavigateAndCacheOptions, PuppeteerPageHelper, LinkData } from './PupeteerPageHelper.js';
import { PuppeteerHelper } from './PuppeteerHelper.js';
import { compressHtml } from './compressHtml.js';
import { linkScrapingSchema } from '../schemas.js';

export type ScrapeOptions = {
    numberOfPages: number;
    extractOptions: ZodLlmQuerierOptions;
    linkExtractOptions: ZodLlmQuerierOptions;
    linkInstruction: string;
    useAiMerge?: boolean;
    mergeInstruction?: string;
    mergeOptions?: ZodLlmQuerierOptions;
}

export type AiWebsiteInfoScraperDependencies = {
    infoQuerier: ZodLlmQuerier;
    linkQuerier: ZodLlmQuerier;
    mergeQuerier: ZodLlmQuerier;
    eventTracker: EventTracker;
    puppeteerHelper: PuppeteerHelper;
}

export class AiWebsiteInfoScraper {
    protected infoQuerier: ZodLlmQuerier;
    protected linkQuerier: ZodLlmQuerier;
    protected mergeQuerier: ZodLlmQuerier;
    protected eventTracker: EventTracker;
    protected puppeteerHelper: PuppeteerHelper;
    protected options: ScrapeOptions;

    constructor(dependencies: AiWebsiteInfoScraperDependencies, options: ScrapeOptions) {
        this.infoQuerier = dependencies.infoQuerier;
        this.linkQuerier = dependencies.linkQuerier;
        this.mergeQuerier = dependencies.mergeQuerier;
        this.eventTracker = dependencies.eventTracker;
        this.puppeteerHelper = dependencies.puppeteerHelper;
        this.options = options;
    }

    private async extractRelevantLinksFromList<SchemaType extends ZodObject<any, any, any>>(
        baseUrl: string,
        links: LinkData[],
        dataExtractionSchema: SchemaType,
        instruction: string,
    ) {
        const linksText = links.map(link => `URL: ${link.href}\nText: ${link.text}`).join('\n\n');

        const mainInstruction = `You are a web scraper assistant. Your task is to identify the most relevant URLs for scraping additional company information from the provided list of links found on the website ${baseUrl}.
${instruction}`;

        const userMessagePayload: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            {
                type: "text",
                text: `Base URL: ${baseUrl}\n\nList of links with their anchor text:\n${linksText}`
            },
        ];

        const linkExtractOptions = this.options.linkExtractOptions;
        return this.linkQuerier.query(
            mainInstruction,
            userMessagePayload,
            dataExtractionSchema,
            linkExtractOptions
        );
    }

    private async extractDataFromHtmlContent<SchemaType extends ZodObject<any, any, any>>(
        url: string,
        html: string,
        dataExtractionSchema: SchemaType,
        instruction: string,
    ) {
        const compressedHtml = compressHtml(html);
        const turndownService = new TurndownService();
        const markdown = turndownService.turndown(compressedHtml);

        const mainInstruction = `You are given the website's content of ${url} (converted to markdown). Your primary goal is to extract information from this content to accurately populate the provided JSON schema.
${instruction}`;

        const userMessagePayload: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            {
                type: "text",
                text: `Website content (markdown):\n${markdown}`
            },
        ];

        return await this.eventTracker.trackOperation(
            'extract_data',
            { url },
            () => this.infoQuerier.query(
                mainInstruction,
                userMessagePayload,
                dataExtractionSchema,
                this.options.extractOptions
            )
        );
    }

    private async aiMergeData<SchemaType extends ZodObject<any, any, any>>(
        allData: (z.infer<SchemaType>)[],
        dataExtractionSchema: SchemaType,
        instruction: string,
        firstPageHtml?: string,
    ) {
        const mainInstruction = `You are a data consolidation expert. Your task is to merge multiple JSON objects, each extracted from a different page of the same website, into a single, comprehensive JSON object that conforms to the provided schema.

- Combine information intelligently. For example, if one page lists two social media links and another page lists three, the final object should contain all five unique links.
- Resolve conflicts logically. If there are discrepancies, prioritize the most complete and plausible information.
- For most fields, do not leave them empty if data is available from any source. However, follow any specific instructions for creating or completing fields like 'sampleOffer'.
- Ensure the final output strictly adheres to the JSON schema.

${instruction}`;

        const userMessagePayload: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            {
                type: "text",
                text: `Here are the JSON objects to merge:\n\n${JSON.stringify(allData, null, 2)}`
            },
        ];

        if (firstPageHtml) {
            const compressedHtml = compressHtml(firstPageHtml);
            const turndownService = new TurndownService();
            const markdown = turndownService.turndown(compressedHtml);
            userMessagePayload.push({
                type: "text",
                text: `For context, here is the markdown content of the main page from which the scraping started:\n\n${markdown}`
            });
        }

        const mergeOptions = this.options.mergeOptions || this.options.extractOptions;

        return await this.eventTracker.trackOperation(
            'ai_merge_data',
            { count: allData.length },
            () => this.mergeQuerier.query(
                mainInstruction,
                userMessagePayload,
                dataExtractionSchema,
                mergeOptions
            )
        );
    }

    private async scrapeSinglePageForData<SchemaType extends ZodObject<any, any, any>>(
        url: string,
        dataExtractionSchema: SchemaType,
        instruction: string,
        pageHelper: PuppeteerPageHelper,
        navOptions: NavigateAndCacheOptions
    ) {
        const getHtmlAction = (pHelper: PuppeteerPageHelper) => pHelper.getFinalHtml();
        const html = await this.eventTracker.trackOperation(
            'fetch_html',
            { url },
            () => pageHelper.navigateAndCache(url, getHtmlAction, navOptions)
        );
        return await this.extractDataFromHtmlContent(url, html, dataExtractionSchema, instruction);
    }

    private async scrapePagesInParallel<SchemaType extends ZodObject<any, any, any>>(
        urls: string[],
        dataExtractionSchema: SchemaType,
        instruction: string
    ) {
        const settledResults = await Promise.allSettled(
            urls.map(async (linkUrl) => {
                const pageHelper = await this.puppeteerHelper.getPageHelper();
                    const data = await this.scrapeSinglePageForData(linkUrl, dataExtractionSchema, instruction, pageHelper, {
                        closePage: true,
                        dismissCookies: false,
                        htmlOnly: true,
                    });
                    return data;
            })
        );

        const pageResults = settledResults
            .map(result => result.status === 'fulfilled' ? result.value : null)
            .filter(Boolean) as (z.infer<SchemaType>)[];

        return pageResults;
    }

    public async scrape<T extends ZodObject<any, any, any>>(
        url: string,
        dataExtractionSchema: T,
        instruction: string,
        mergeInstruction?: string,
    ) {
        const pageHelper = await this.puppeteerHelper.getPageHelper();
        try {
            // Step 1: Fetch main page HTML.
            const getHtmlAction = (pHelper: PuppeteerPageHelper) => pHelper.getFinalHtml();
            const firstPageHtml = await this.eventTracker.trackOperation(
                'fetch_html',
                { url },
                () => pageHelper.navigateAndCache(url, getHtmlAction, {
                    closePage: false, // Keep page open for subsequent actions
                    dismissCookies: false,
                    htmlOnly: true,
                })
            );

            // Step 2: Extract data from the first page's HTML.
            const firstPageDataPromise = this.extractDataFromHtmlContent(url, firstPageHtml, dataExtractionSchema, instruction);

            // Step 3: Find and scrape sub-pages.
            const linkInstruction = this.options.linkInstruction;
            const linksToScrape = await this.eventTracker.trackOperation(
                'extract_links',
                { url },
                async () => {
                    const allLinksOnPage = await pageHelper.extractLinksWithText();
                    const linkData = await this.extractRelevantLinksFromList(url, allLinksOnPage, linkScrapingSchema, linkInstruction);
                    const allLinks = (linkData as { scrapingLinks?: string[] })?.scrapingLinks || [];
                    return allLinks.slice(0, this.options.numberOfPages);
                }
            );

            const otherUrlsToScrape = linksToScrape.filter(link => link !== url);
            const otherPagesDataPromise = this.scrapePagesInParallel(otherUrlsToScrape, dataExtractionSchema, instruction);

            // Await all content scraping
            const [firstPageData, otherPagesData] = await Promise.all([
                firstPageDataPromise,
                otherPagesDataPromise,
            ]);

            const allData = [firstPageData, ...otherPagesData].filter(Boolean) as (z.infer<T>)[];

            // Merge and return the final combined result.
            if (this.options.useAiMerge) {
                // Always call AI merge if enabled, even with 0 or 1 result.
                // This allows the AI to create or complete data (like sampleOffer) using the first page's HTML context.
                const finalMergeInstruction = mergeInstruction || this.options.mergeInstruction || '';
                return this.aiMergeData(allData, dataExtractionSchema, finalMergeInstruction, firstPageHtml);
            } else {
                // Fallback to simple lodash merge if AI merge is disabled.
                if (allData.length === 0) {
                    return {};
                }
                if (allData.length === 1) {
                    return allData[0];
                }
                const mergedData = merge({}, ...allData);
                return mergedData;
            }
        } finally {
            await pageHelper.close();
        }
    }
}

export type BuildScraperFunction = (eventTracker: EventTracker, options?: { useAiMerge?: boolean, mergeInstruction?: string }) => AiWebsiteInfoScraper;
