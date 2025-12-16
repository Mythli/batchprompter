import { z } from 'zod';
import TurndownService from 'turndown';
import OpenAI from 'openai';
import {
    Plugin,
    PluginExecutionContext,
    PluginResult,
    CLIOptionDefinition
} from '../types.js';
import { ServiceCapabilities, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema } from '../../config/schema.js';
import { DEFAULT_OUTPUT } from '../../config/defaults.js';
import { compressHtml } from '../../utils/compressHtml.js';

// =============================================================================
// Config Schema
// =============================================================================

export const UrlExpanderConfigSchemaV2 = z.object({
    type: z.literal('url-expander'),
    id: z.string().optional(),
    output: OutputConfigSchema.optional(),
    mode: z.enum(['auto', 'fetch', 'puppeteer']).default('auto'),
    maxChars: z.number().int().positive().default(30000)
});

export type UrlExpanderRawConfigV2 = z.infer<typeof UrlExpanderConfigSchemaV2>;

export interface UrlExpanderResolvedConfigV2 {
    type: 'url-expander';
    id: string;
    output: ResolvedOutputConfig;
    mode: 'auto' | 'fetch' | 'puppeteer';
    maxChars: number;
}

// =============================================================================
// Plugin
// =============================================================================

export class UrlExpanderPluginV2 implements Plugin<UrlExpanderRawConfigV2, UrlExpanderResolvedConfigV2> {
    readonly type = 'url-expander';
    readonly configSchema = UrlExpanderConfigSchemaV2;

    readonly cliOptions: CLIOptionDefinition[] = [
        { flags: '--expand-urls', description: 'Enable URL expansion in prompts' },
        { flags: '--expand-urls-mode <mode>', description: 'Expansion mode (auto/fetch/puppeteer)', defaultValue: 'auto' },
        { flags: '--expand-urls-max-chars <number>', description: 'Max chars per URL', parser: parseInt, defaultValue: 30000 }
    ];

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        // Puppeteer is optional - only required if mode is 'puppeteer'
        return [];
    }

    parseCLIOptions(options: Record<string, any>, stepIndex: number): UrlExpanderRawConfigV2 | null {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const enabled = getOpt('expandUrls');
        if (!enabled) return null;

        return {
            type: 'url-expander',
            mode: getOpt('expandUrlsMode') ?? 'auto',
            maxChars: getOpt('expandUrlsMaxChars') ?? 30000
        };
    }

    async resolveConfig(
        rawConfig: UrlExpanderRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
    ): Promise<UrlExpanderResolvedConfigV2> {
        return {
            type: 'url-expander',
            id: rawConfig.id ?? `url-expander-${Date.now()}`,
            output: {
                mode: rawConfig.output?.mode ?? DEFAULT_OUTPUT.mode,
                column: rawConfig.output?.column,
                explode: rawConfig.output?.explode ?? DEFAULT_OUTPUT.explode
            },
            mode: rawConfig.mode,
            maxChars: rawConfig.maxChars
        };
    }

    async execute(
        config: UrlExpanderResolvedConfigV2,
        context: PluginExecutionContext
    ): Promise<PluginResult> {
        // This plugin is special - it modifies accumulated content
        // It's typically run as a preprocessor before the main model
        // For now, return empty packets (no-op for standard execution)
        // The actual URL expansion happens in the preprocessor phase

        return {
            packets: [{
                data: {},
                contentParts: []
            }]
        };
    }

    /**
     * Process content parts and expand URLs found within text
     * This is called during the preprocessing phase
     */
    async processContentParts(
        parts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        config: UrlExpanderResolvedConfigV2,
        context: PluginExecutionContext
    ): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        const { services } = context;
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const turndownService = new TurndownService();
        turndownService.remove(['script', 'style', 'noscript', 'iframe']);

        const newParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

        for (const part of parts) {
            if (part.type !== 'text') {
                newParts.push(part);
                continue;
            }

            const text = part.text;
            const rawUrls = text.match(urlRegex);

            if (!rawUrls || rawUrls.length === 0) {
                newParts.push(part);
                continue;
            }

            // Clean and dedupe URLs
            const uniqueUrls = new Set<string>();
            for (let url of rawUrls) {
                // Strip trailing punctuation
                while (true) {
                    const lastChar = url.charAt(url.length - 1);
                    if (/[.,!?;:]/.test(lastChar)) {
                        url = url.slice(0, -1);
                        continue;
                    }
                    if (lastChar === ')') {
                        const openCount = (url.match(/\(/g) || []).length;
                        const closeCount = (url.match(/\)/g) || []).length;
                        if (closeCount > openCount) {
                            url = url.slice(0, -1);
                            continue;
                        }
                    }
                    break;
                }
                if (url.length > 0) uniqueUrls.add(url);
            }

            const expansions: string[] = [];

            for (const url of uniqueUrls) {
                try {
                    let content: string | null = null;

                    if (config.mode === 'fetch' || (config.mode === 'auto' && !services.puppeteerHelper)) {
                        // Use fetch
                        const response = await services.fetcher(url);
                        if (response.ok) {
                            content = await response.text();
                        }
                    } else if (services.puppeteerHelper && services.puppeteerQueue) {
                        // Use Puppeteer
                        content = await services.puppeteerQueue.add(async () => {
                            const pageHelper = await services.puppeteerHelper!.getPageHelper();
                            try {
                                return await pageHelper.navigateAndCache<string>(
                                    url,
                                    async (ph) => {
                                        const html = await ph.getFinalHtml();
                                        return compressHtml(html);
                                    },
                                    {
                                        htmlOnly: true,
                                        ttl: 24 * 60 * 60 * 1000
                                    }
                                );
                            } finally {
                                await pageHelper.close();
                            }
                        }) as string | null;
                    }

                    if (content) {
                        const markdown = turndownService.turndown(content);
                        const truncated = markdown.substring(0, config.maxChars);
                        expansions.push(`\n\n--- Content of ${url} ---\n${truncated}\n--------------------------\n`);
                        console.log(`[UrlExpander] Expanded: ${url}`);
                    }
                } catch (e: any) {
                    console.warn(`[UrlExpander] Failed to expand ${url}: ${e.message}`);
                }
            }

            newParts.push(part);
            if (expansions.length > 0) {
                newParts.push({ type: 'text', text: expansions.join('') });
            }
        }

        return newParts;
    }
}
