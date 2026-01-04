import OpenAI from 'openai';
import TurndownService from 'turndown';
import { z } from 'zod';
import { Plugin, PluginExecutionContext, PluginResult } from '../types.js';
import { UrlHandlerRegistry } from './utils/UrlHandlerRegistry.js';
import { ServiceCapabilities, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema } from '../../config/common.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';

// =============================================================================
// Config Schema
// =============================================================================

export const UrlExpanderConfigSchema = z.object({
    type: z.literal('url-expander').describe("Identifies this as a URL expander plugin."),
    id: z.string().optional().describe("Unique ID for this plugin instance."),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }).describe("How to save the expanded content (usually ignored as it modifies prompt)."),
    mode: z.enum(['fetch', 'puppeteer']).default('puppeteer').describe("Method used to fetch the URL content."),
    maxChars: z.number().int().positive().default(30000).describe("Maximum number of characters to include from the expanded content.")
});

export type UrlExpanderConfig = z.infer<typeof UrlExpanderConfigSchema>;

export interface UrlExpanderResolvedConfig {
    type: 'url-expander';
    id: string;
    output: ResolvedOutputConfig;
    mode: 'fetch' | 'puppeteer';
    maxChars: number;
}

export class UrlExpanderPlugin implements Plugin<UrlExpanderConfig, UrlExpanderResolvedConfig> {
    readonly type = 'url-expander';
    readonly configSchema = UrlExpanderConfigSchema;
    readonly cliOptions = []; // Managed by adapter

    constructor(private registry: UrlHandlerRegistry) {}

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return [];
    }

    parseCLIOptions(): UrlExpanderConfig | null {
        return null; // Managed by adapter
    }

    async resolveConfig(
        rawConfig: UrlExpanderConfig,
        row: Record<string, any>,
        inheritedModel: any,
        contentResolver: ContentResolver
    ): Promise<UrlExpanderResolvedConfig> {
        return {
            type: 'url-expander',
            id: rawConfig.id ?? `url-expander-${Date.now()}`,
            output: {
                mode: rawConfig.output.mode,
                column: rawConfig.output.column,
                explode: rawConfig.output.explode
            },
            mode: rawConfig.mode,
            maxChars: rawConfig.maxChars
        };
    }

    async execute(
        config: UrlExpanderResolvedConfig,
        context: PluginExecutionContext
    ): Promise<PluginResult> {
        // This plugin transforms content, it doesn't generate new packets in execute
        return { packets: [] };
    }

    async transform(
        parts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        config: UrlExpanderResolvedConfig,
        context: PluginExecutionContext
    ): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {

        const { mode, maxChars } = config;

        // Resolve the generic handler based on mode
        const fallbackHandler = this.registry.getFallback(mode);

        const newParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

        // Regex to find http/https URLs.
        const urlRegex = /(https?:\/\/[^\s]+)/g;

        const turndownService = new TurndownService();
        turndownService.remove(['script', 'style', 'noscript', 'iframe']);

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

            const uniqueUrls = new Set<string>();

            // Clean and deduplicate URLs
            for (let url of rawUrls) {
                // Strip common trailing punctuation
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

                if (url.length > 0) {
                    uniqueUrls.add(url);
                }
            }

            const expansions: string[] = [];

            for (const url of uniqueUrls) {
                try {
                    let content: string | null = null;
                    let handlerName = 'unknown';

                    // 1. Check Specific Handlers (Priority)
                    const specificHandler = this.registry.getSpecificHandler(url);
                    if (specificHandler) {
                        handlerName = specificHandler.name;
                        content = await specificHandler.handle(url, context.services, fallbackHandler);
                    } else {
                        // 2. Fallback based on mode
                        handlerName = fallbackHandler.name;
                        const rawHtml = await fallbackHandler.handle(url, context.services);
                        if (rawHtml) {
                            content = turndownService.turndown(rawHtml);
                        }
                    }

                    if (content) {
                        console.log(`[UrlExpander] Expanded ${url} using ${handlerName}`);
                        const truncated = content.substring(0, maxChars);
                        expansions.push(`\n\n--- Content of ${url} ---\n${truncated}\n--------------------------\n`);
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
