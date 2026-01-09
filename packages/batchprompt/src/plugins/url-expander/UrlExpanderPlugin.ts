import OpenAI from 'openai';
import TurndownService from 'turndown';
import { Plugin, PluginPacket } from '../types.js';
import { Step } from '../../Step.js';
import { StepRow } from '../../StepRow.js';
import { UrlHandlerRegistry } from './utils/UrlHandlerRegistry.js';
import {
    UrlExpanderConfig,
    UrlExpanderResolvedConfig,
    UrlExpanderConfigSchema
} from './UrlExpanderConfig.js';

export class UrlExpanderPlugin implements Plugin<UrlExpanderConfig, UrlExpanderResolvedConfig> {
    readonly type = 'url-expander';
    readonly configSchema = UrlExpanderConfigSchema;

    constructor(private registry: UrlHandlerRegistry) {}

    async init(step: Step, rawConfig: UrlExpanderConfig): Promise<UrlExpanderResolvedConfig> {
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

    async prepare(stepRow: StepRow, config: UrlExpanderResolvedConfig): Promise<PluginPacket[]> {
        const { mode, maxChars } = config;
        const messages = stepRow.history;

        // Also check current step messages (which might contain the prompt with the URL)
        const currentMessages = stepRow.step.config.model.messages || [];

        // We want to modify the history that will be used for the LLM.
        // The StepRow combines history + currentMessages.
        // We will operate on the combined set and return a new history array.
        const allMessages = [...messages, ...currentMessages];

        // Resolve the generic handler based on mode
        const fallbackHandler = this.registry.getFallback(mode);

        // Regex to find http/https URLs.
        const urlRegex = /(https?:\/\/[^\s]+)/g;

        const turndownService = new TurndownService();
        turndownService.remove(['script', 'style', 'noscript', 'iframe']);

        // Scan ONLY the last message for URLs to expand
        const lastMessageIndex = allMessages.length - 1;
        const lastMessage = allMessages[lastMessageIndex];

        if (!lastMessage || (lastMessage.role !== 'user' && lastMessage.role !== 'system')) {
            return [{ data: [null], contentParts: [] }];
        }

        const content = lastMessage.content;
        if (!content) return [{ data: [null], contentParts: [] }];

        let partsToCheck: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

        if (typeof content === 'string') {
            partsToCheck = [{ type: 'text', text: content }];
        } else if (Array.isArray(content)) {
            partsToCheck = content as OpenAI.Chat.Completions.ChatCompletionContentPart[];
        }

        const newParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        let modified = false;

        for (const part of partsToCheck) {
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

            let newText = text;

            for (const url of uniqueUrls) {
                try {
                    let content: string | null = null;
                    let handlerName = 'unknown';

                    // 1. Check Specific Handlers (Priority)
                    const specificHandler = this.registry.getSpecificHandler(url);
                    if (specificHandler) {
                        handlerName = specificHandler.name;
                        content = await specificHandler.handle(url, fallbackHandler);
                    } else {
                        // 2. Fallback based on mode
                        handlerName = fallbackHandler.name;
                        const rawHtml = await fallbackHandler.handle(url);
                        if (rawHtml) {
                            content = turndownService.turndown(rawHtml);
                        }
                    }

                    if (content) {
                        console.log(`[UrlExpander] Expanded ${url} using ${handlerName}`);
                        const truncated = content.substring(0, maxChars);
                        const expansionText = `\n\n--- Content of ${url} ---\n${truncated}\n--------------------------\n`;
                        
                        // Append expansion to the text
                        newText += expansionText;
                        modified = true;
                    }
                } catch (e: any) {
                    console.warn(`[UrlExpander] Failed to expand ${url}: ${e.message}`);
                }
            }
            
            newParts.push({ type: 'text', text: newText });
        }

        if (modified) {
            // Create a new history array with the modified last message
            const newHistory = [...allMessages];
            newHistory[lastMessageIndex] = { ...lastMessage, content: newParts };

            return [{
                data: [null],
                contentParts: [],
                history: newHistory
            }];
        }

        return [{ data: [null], contentParts: [] }];
    }
}
