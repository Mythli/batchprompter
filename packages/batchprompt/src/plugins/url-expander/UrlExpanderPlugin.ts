import OpenAI from 'openai';
import TurndownService from 'turndown';
import { Plugin, PluginExecutionContext, PluginPacket } from '../types.js';
import { UrlHandlerRegistry } from './utils/UrlHandlerRegistry.js';
import { ServiceCapabilities } from '../../config/types.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';
import { 
    UrlExpanderConfig, 
    UrlExpanderResolvedConfig, 
    UrlExpanderConfigSchema,
    UrlExpanderStepExtension 
} from './UrlExpanderConfig.js';

export class UrlExpanderPlugin implements Plugin<UrlExpanderConfig, UrlExpanderResolvedConfig> {
    readonly type = 'url-expander';
    readonly configSchema = UrlExpanderConfigSchema;
    readonly stepExtensionSchema = UrlExpanderStepExtension;

    constructor(private registry: UrlHandlerRegistry) {}

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return [];
    }

    mapStepToConfig(stepConfig: any): UrlExpanderConfig | null {
        const config = stepConfig.expandUrls;
        
        // If explicitly false, do not activate
        if (config === false) return null;

        // If true or undefined (default), use defaults
        if (config === true || config === undefined) {
            return {
                type: 'url-expander',
                output: { mode: 'ignore', explode: false },
                mode: 'fetch',
                maxChars: 30000
            };
        }

        // If object, merge with defaults
        return {
            type: 'url-expander',
            output: { mode: 'ignore', explode: false },
            mode: config.mode || 'fetch',
            maxChars: config.maxChars || 30000,
            id: config.id
        };
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

    async prepareMessages(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        config: UrlExpanderResolvedConfig,
        context: PluginExecutionContext
    ): Promise<PluginPacket[] | null> {

        const { mode, maxChars } = config;

        // Resolve the generic handler based on mode
        const fallbackHandler = this.registry.getFallback(mode);

        // Regex to find http/https URLs.
        const urlRegex = /(https?:\/\/[^\s]+)/g;

        const turndownService = new TurndownService();
        turndownService.remove(['script', 'style', 'noscript', 'iframe']);

        const contentPartsToAdd: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        const expandedData: Record<string, string> = {};

        // Scan ONLY the last message for URLs to expand
        // This prevents re-expanding URLs present in the history from previous steps.
        const lastMessage = messages[messages.length - 1];
        
        if (!lastMessage) {
            return null;
        }

        if (lastMessage.role !== 'user' && lastMessage.role !== 'system') {
            return null;
        }

        const content = lastMessage.content;
        if (!content) return null;

        let partsToCheck: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

        if (typeof content === 'string') {
            partsToCheck = [{ type: 'text', text: content }];
        } else if (Array.isArray(content)) {
            partsToCheck = content as OpenAI.Chat.Completions.ChatCompletionContentPart[];
        }

        for (const part of partsToCheck) {
            if (part.type !== 'text') continue;

            const text = part.text;
            const rawUrls = text.match(urlRegex);

            if (!rawUrls || rawUrls.length === 0) continue;

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

            for (const url of uniqueUrls) {
                try {
                    let content: string | null = null;
                    let handlerName = 'unknown';

                    // 1. Check Specific Handlers (Priority)
                    const specificHandler = this.registry.getSpecificHandler(url);
                    if (specificHandler) {
                        handlerName = specificHandler.name;
                        // Note: We pass empty services object because handlers now have injected deps
                        content = await specificHandler.handle(url, {} as any, fallbackHandler);
                    } else {
                        // 2. Fallback based on mode
                        handlerName = fallbackHandler.name;
                        const rawHtml = await fallbackHandler.handle(url, {} as any);
                        if (rawHtml) {
                            content = turndownService.turndown(rawHtml);
                        }
                    }

                    if (content) {
                        console.log(`[UrlExpander] Expanded ${url} using ${handlerName}`);
                        const truncated = content.substring(0, maxChars);
                        const expansionText = `\n\n--- Content of ${url} ---\n${truncated}\n--------------------------\n`;
                        
                        contentPartsToAdd.push({ type: 'text', text: expansionText });
                        expandedData[url] = truncated;
                    }
                } catch (e: any) {
                    console.warn(`[UrlExpander] Failed to expand ${url}: ${e.message}`);
                }
            }
        }

        // If no content was added, return null to indicate pass-through (don't filter the row)
        if (contentPartsToAdd.length === 0) {
            return null;
        }

        // Return a single packet with all expansions
        // This will be appended to the accumulated content by ResultProcessor
        return [{
            data: expandedData,
            contentParts: contentPartsToAdd
        }];
    }
}
