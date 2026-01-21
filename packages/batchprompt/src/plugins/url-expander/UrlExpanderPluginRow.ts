import OpenAI from 'openai';
import TurndownService from 'turndown';
import { BasePluginRow, PluginResult } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { UrlExpanderConfig } from './UrlExpanderConfig.js';
import { UrlHandlerRegistry } from './utils/UrlHandlerRegistry.js';

export class UrlExpanderPluginRow extends BasePluginRow<UrlExpanderConfig> {
    constructor(
        stepRow: StepRow,
        config: UrlExpanderConfig,
        private registry: UrlHandlerRegistry
    ) {
        super(stepRow, config);
    }

    async prepare(): Promise<PluginResult> {
        const { stepRow, config, registry } = this;
        const { mode, maxChars } = config;

        // Get all prepared messages
        const messages = await stepRow.getPreparedMessages();

        // Clone messages to avoid mutation
        const clonedMessages = JSON.parse(JSON.stringify(messages)) as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

        // Find the last user or system message to scan for URLs
        let lastMessageIndex = -1;
        for (let i = clonedMessages.length - 1; i >= 0; i--) {
            const msg = clonedMessages[i];
            if (msg.role === 'user' || msg.role === 'system') {
                lastMessageIndex = i;
                break;
            }
        }

        if (lastMessageIndex === -1) {
            // No user/system message found, pass through unchanged
            return {
                history: messages,
                items: [{ data: null, contentParts: [] }]
            };
        }

        const lastMessage = clonedMessages[lastMessageIndex];
        const content = lastMessage.content;

        if (!content) {
            return {
                history: messages,
                items: [{ data: null, contentParts: [] }]
            };
        }

        // Normalize content to parts array
        let parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        if (typeof content === 'string') {
            parts = [{ type: 'text', text: content }];
        } else if (Array.isArray(content)) {
            parts = content as OpenAI.Chat.Completions.ChatCompletionContentPart[];
        }

        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const turndownService = new TurndownService();
        turndownService.remove(['script', 'style', 'noscript', 'iframe']);

        // Get fallback handler based on mode
        const fallbackHandler = registry.getFallback(mode);

        let modified = false;
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

            // Clean and deduplicate URLs
            const uniqueUrls = new Set<string>();
            for (let url of rawUrls) {
                url = this.cleanUrl(url);
                if (url.length > 0) {
                    uniqueUrls.add(url);
                }
            }

            let newText = text;

            for (const url of uniqueUrls) {
                try {
                    let expandedContent: string | null = null;
                    let handlerName = 'unknown';

                    // Check for specific handler first
                    const specificHandler = registry.getSpecificHandler(url);
                    if (specificHandler) {
                        handlerName = specificHandler.name;
                        expandedContent = await specificHandler.handle(url, fallbackHandler);
                    } else {
                        // Use fallback handler
                        handlerName = fallbackHandler.name;
                        const rawHtml = await fallbackHandler.handle(url);
                        if (rawHtml) {
                            expandedContent = turndownService.turndown(rawHtml);
                        }
                    }

                    if (expandedContent) {
                        console.log(`[UrlExpander] Expanded ${url} using ${handlerName}`);
                        const truncated = expandedContent.substring(0, maxChars);
                        const expansionText = `\n\n--- Content of ${url} ---\n${truncated}\n--------------------------\n`;

                        // Append expansion inline
                        newText += expansionText;
                        modified = true;
                    }
                } catch (e: any) {
                    console.warn(`[UrlExpander] Failed to expand ${url}: ${e.message}`);
                }
            }

            newParts.push({ type: 'text', text: newText });
        }

        if (!modified) {
            // No changes made, return original messages
            return {
                history: messages,
                items: [{ data: null, contentParts: [] }]
            };
        }

        // Update the last message with modified content
        // Handle the type correctly based on message role
        const updatedMessage = clonedMessages[lastMessageIndex];
        if (updatedMessage.role === 'user') {
            (updatedMessage as OpenAI.Chat.Completions.ChatCompletionUserMessageParam).content = newParts;
        } else if (updatedMessage.role === 'system') {
            // System messages only support string or array of text parts
            const textContent = newParts
                .filter((p): p is OpenAI.Chat.Completions.ChatCompletionContentPartText => p.type === 'text')
                .map(p => p.text)
                .join('\n');
            (updatedMessage as OpenAI.Chat.Completions.ChatCompletionSystemMessageParam).content = textContent;
        }

        return {
            history: clonedMessages,
            items: [{ data: null, contentParts: [] }]
        };
    }

    private cleanUrl(url: string): string {
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
        return url;
    }
}
