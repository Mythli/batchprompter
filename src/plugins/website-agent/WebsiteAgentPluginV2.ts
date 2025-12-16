import { z } from 'zod';
import Handlebars from 'handlebars';
import TurndownService from 'turndown';
import OpenAI from 'openai';
import {
    Plugin,
    PluginExecutionContext,
    PluginResult,
    CLIOptionDefinition
} from '../types.js';
import { ServiceCapabilities, ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, PromptDefSchema } from '../../config/schema.js';
import { PromptLoader } from '../../config/PromptLoader.js';
import { SchemaLoader } from '../../config/SchemaLoader.js';
import { DEFAULT_OUTPUT } from '../../config/defaults.js';
import { compressHtml } from '../../utils/compressHtml.js';
import { LinkData } from '../../utils/puppeteer/PuppeteerPageHelper.js';

// =============================================================================
// Config Schema
// =============================================================================

export const WebsiteAgentConfigSchemaV2 = z.object({
    type: z.literal('website-agent'),
    id: z.string().optional(),
    output: OutputConfigSchema.optional(),
    url: z.string(),
    schema: z.union([z.string(), z.record(z.any())]),
    budget: z.number().int().positive().default(10),
    batchSize: z.number().int().positive().default(3),
    navigatorPrompt: PromptDefSchema.optional(),
    extractPrompt: PromptDefSchema.optional(),
    mergePrompt: PromptDefSchema.optional()
});

export type WebsiteAgentRawConfigV2 = z.infer<typeof WebsiteAgentConfigSchemaV2>;

export interface WebsiteAgentResolvedConfigV2 {
    type: 'website-agent';
    id: string;
    output: ResolvedOutputConfig;
    url: string;
    schema: any;
    budget: number;
    batchSize: number;
    navigatorModel: ResolvedModelConfig;
    extractModel: ResolvedModelConfig;
    mergeModel: ResolvedModelConfig;
}

// =============================================================================
// Plugin
// =============================================================================

const DEFAULT_NAVIGATOR = 'You are an autonomous web scraper. Analyze findings and available links to decide which pages to visit next.';
const DEFAULT_EXTRACT = 'You are a data extraction expert. Extract information from the website content to populate the JSON schema.';
const DEFAULT_MERGE = 'You are a data consolidation expert. Merge the JSON objects into a single comprehensive object.';

export class WebsiteAgentPluginV2 implements Plugin<WebsiteAgentRawConfigV2, WebsiteAgentResolvedConfigV2> {
    readonly type = 'website-agent';
    readonly configSchema = WebsiteAgentConfigSchemaV2;

    private promptLoader = new PromptLoader();
    private schemaLoader = new SchemaLoader();

    readonly cliOptions: CLIOptionDefinition[] = [
        { flags: '--website-agent-url <url>', description: 'Starting URL to scrape' },
        { flags: '--website-agent-schema <path>', description: 'JSON Schema for extraction' },
        { flags: '--website-agent-budget <number>', description: 'Max pages to visit', parser: parseInt, defaultValue: 10 },
        { flags: '--website-agent-batch-size <number>', description: 'Pages per batch', parser: parseInt, defaultValue: 3 },
        { flags: '--website-navigator-prompt <text>', description: 'Navigator prompt' },
        { flags: '--website-extract-prompt <text>', description: 'Extraction prompt' },
        { flags: '--website-merge-prompt <text>', description: 'Merge prompt' },
        { flags: '--website-agent-export', description: 'Merge results into row' },
        { flags: '--website-agent-output <column>', description: 'Save to column' }
    ];

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return ['hasPuppeteer'];
    }

    parseCLIOptions(options: Record<string, any>, stepIndex: number): WebsiteAgentRawConfigV2 | null {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const url = getOpt('websiteAgentUrl');
        if (!url) return null;

        const exportFlag = getOpt('websiteAgentExport');
        const outputColumn = getOpt('websiteAgentOutput');

        let outputMode: 'merge' | 'column' | 'ignore' = 'ignore';
        if (outputColumn) outputMode = 'column';
        else if (exportFlag) outputMode = 'merge';

        return {
            type: 'website-agent',
            url,
            schema: getOpt('websiteAgentSchema'),
            budget: getOpt('websiteAgentBudget') ?? 10,
            batchSize: getOpt('websiteAgentBatchSize') ?? 3,
            navigatorPrompt: getOpt('websiteNavigatorPrompt'),
            extractPrompt: getOpt('websiteExtractPrompt'),
            mergePrompt: getOpt('websiteMergePrompt'),
            output: {
                mode: outputMode,
                column: outputColumn,
                explode: false
            }
        };
    }

    async resolveConfig(
        rawConfig: WebsiteAgentRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
    ): Promise<WebsiteAgentResolvedConfigV2> {
        const resolveModelWithPrompt = async (prompt: any, defaultPrompt: string): Promise<ResolvedModelConfig> => {
            let parts: OpenAI.Chat.Completions.ChatCompletionContentPart[];

            if (prompt) {
                parts = await this.promptLoader.load(prompt);
                parts = parts.map(part => {
                    if (part.type === 'text') {
                        const template = Handlebars.compile(part.text, { noEscape: true });
                        return { type: 'text' as const, text: template(row) };
                    }
                    return part;
                });
            } else {
                parts = [{ type: 'text', text: defaultPrompt }];
            }

            return {
                model: inheritedModel.model,
                temperature: inheritedModel.temperature,
                thinkingLevel: inheritedModel.thinkingLevel,
                systemParts: [],
                promptParts: parts
            };
        };

        // Resolve URL
        const urlTemplate = Handlebars.compile(rawConfig.url, { noEscape: true });
        const url = urlTemplate(row);

        // Resolve schema
        let schema: any;
        if (typeof rawConfig.schema === 'string') {
            schema = await this.schemaLoader.loadWithContext(rawConfig.schema, row);
        } else if (rawConfig.schema) {
            schema = rawConfig.schema;
        } else {
            schema = {
                type: 'object',
                properties: {
                    summary: { type: 'string', description: 'Summary of the website content' }
                },
                required: ['summary']
            };
        }

        return {
            type: 'website-agent',
            id: rawConfig.id ?? `website-agent-${Date.now()}`,
            output: {
                mode: rawConfig.output?.mode ?? DEFAULT_OUTPUT.mode,
                column: rawConfig.output?.column,
                explode: rawConfig.output?.explode ?? DEFAULT_OUTPUT.explode
            },
            url,
            schema,
            budget: rawConfig.budget,
            batchSize: rawConfig.batchSize,
            navigatorModel: await resolveModelWithPrompt(rawConfig.navigatorPrompt, DEFAULT_NAVIGATOR),
            extractModel: await resolveModelWithPrompt(rawConfig.extractPrompt, DEFAULT_EXTRACT),
            mergeModel: await resolveModelWithPrompt(rawConfig.mergePrompt, DEFAULT_MERGE)
        };
    }

    async execute(
        config: WebsiteAgentResolvedConfigV2,
        context: PluginExecutionContext
    ): Promise<PluginResult> {
        const { services, row } = context;
        const { puppeteerHelper, puppeteerQueue } = services;

        if (!puppeteerHelper || !puppeteerQueue) {
            throw new Error('[WebsiteAgent] Puppeteer not available');
        }

        // Validate URL
        if (!config.url || config.url.trim() === '') {
            throw new Error('[WebsiteAgent] No URL provided');
        }

        const urlRegex = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
        if (!urlRegex.test(config.url)) {
            throw new Error(`[WebsiteAgent] Invalid URL: ${config.url}`);
        }

        // Create LLM clients
        const navLlm = services.createLlm(config.navigatorModel);
        const extLlm = services.createLlm(config.extractModel);
        const mrgLlm = services.createLlm(config.mergeModel);

        // Scrape
        const result = await this.scrapeIterative(
            config.url,
            config.schema,
            config.budget,
            config.batchSize,
            puppeteerHelper,
            puppeteerQueue,
            navLlm,
            extLlm,
            mrgLlm,
            row
        );

        return {
            packets: [{
                data: result,
                contentParts: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }]
            }]
        };
    }

    private async scrapeIterative(
        initialUrl: string,
        schema: any,
        budget: number,
        batchSize: number,
        puppeteerHelper: any,
        puppeteerQueue: any,
        navLlm: any,
        extLlm: any,
        mrgLlm: any,
        row: Record<string, any>
    ): Promise<any> {
        let remaining = budget;
        const visitedUrls = new Set<string>();
        const knownLinks = new Map<string, { href: string; text: string; firstSeenOn: string }>();
        const extractedData: any[] = [];

        console.log(`[WebsiteAgent] Starting at ${initialUrl} (Budget: ${budget})`);

        // Helper to get page content
        const getPageContent = async (url: string) => {
            return puppeteerQueue.add(async () => {
                const pageHelper = await puppeteerHelper.getPageHelper();
                try {
                    return await pageHelper.navigateAndCache(
                        url,
                        async (ph: any) => {
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
            });
        };

        // Scrape initial page
        try {
            const initial = await getPageContent(initialUrl);
            visitedUrls.add(initialUrl);
            remaining--;

            const truncated = initial.markdown.substring(0, 20000);
            const data = await extLlm.promptJson(
                { suffix: [{ type: 'text', text: `URL: ${initialUrl}\n\nContent:\n${truncated}` }] },
                schema
            );

            extractedData.push({ url: initialUrl, data });

            for (const link of initial.links) {
                if (!knownLinks.has(link.href)) {
                    knownLinks.set(link.href, { ...link, firstSeenOn: initialUrl });
                }
            }
        } catch (e) {
            console.error(`[WebsiteAgent] Failed to scrape initial URL:`, e);
            return {};
        }

        // Iterative scraping
        while (remaining > 0) {
            const candidates = Array.from(knownLinks.values())
                .filter(l => !visitedUrls.has(l.href) && l.href.startsWith('http'))
                .slice(0, 50);

            if (candidates.length === 0) break;

            // Ask navigator
            const linksText = candidates
                .map((l, i) => `[${i}] ${l.href} (Text: "${l.text}", Found on: "${l.firstSeenOn}")`)
                .join('\n');

            const NavigatorSchema = z.object({
                next_urls: z.array(z.string()),
                reasoning: z.string(),
                is_done: z.boolean()
            });

            const navResponse = await navLlm.promptZod(
                {
                    suffix: [{
                        type: 'text',
                        text: `Status:\n- Visited: ${visitedUrls.size}\n- Budget: ${remaining}\n\nFindings:\n${JSON.stringify(extractedData.map(d => d.data), null, 2)}\n\nAvailable Links:\n${linksText}\n\nSelect up to ${batchSize} links.`
                    }]
                },
                NavigatorSchema
            );

            if (navResponse.is_done || navResponse.next_urls.length === 0) {
                console.log(`[WebsiteAgent] Stopping. Done: ${navResponse.is_done}`);
                break;
            }

            // Filter valid URLs
            const nextUrls = navResponse.next_urls
                .filter(url => candidates.some(c => c.href === url))
                .slice(0, batchSize);

            console.log(`[WebsiteAgent] Next batch: ${nextUrls.join(', ')}`);

            // Scrape batch
            const batchResults = await Promise.allSettled(
                nextUrls.map(async (url) => {
                    if (visitedUrls.has(url)) return null;
                    visitedUrls.add(url);

                    try {
                        const page = await getPageContent(url);
                        const truncated = page.markdown.substring(0, 20000);
                        const data = await extLlm.promptJson(
                            { suffix: [{ type: 'text', text: `URL: ${url}\n\nContent:\n${truncated}` }] },
                            schema
                        );
                        return { url, data, links: page.links };
                    } catch (e) {
                        console.warn(`[WebsiteAgent] Failed to scrape ${url}:`, e);
                        return null;
                    }
                })
            );

            const successful = batchResults
                .filter(r => r.status === 'fulfilled')
                .map(r => (r as PromiseFulfilledResult<any>).value)
                .filter(r => r !== null);

            remaining -= successful.length;

            for (const res of successful) {
                extractedData.push({ url: res.url, data: res.data });
                for (const link of res.links) {
                    if (!knownLinks.has(link.href)) {
                        knownLinks.set(link.href, { ...link, firstSeenOn: res.url });
                    }
                }
            }
        }

        // Merge results
        const dataToMerge = extractedData.map(d => d.data);

        if (dataToMerge.length === 0) return {};
        if (dataToMerge.length === 1) return dataToMerge[0];

        console.log(`[WebsiteAgent] Merging ${dataToMerge.length} results...`);
        return mrgLlm.promptJson(
            { suffix: [{ type: 'text', text: `Objects to merge:\n${JSON.stringify(dataToMerge, null, 2)}` }] },
            schema
        );
    }
}
