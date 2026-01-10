import OpenAI from 'openai';
import TurndownService from 'turndown';
import { BasePlugin, PluginPacket } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { UrlHandlerRegistry } from './utils/UrlHandlerRegistry.js';
import {
    UrlExpanderConfig,
    UrlExpanderConfigSchema,
    UrlExpanderStepExtension
} from './UrlExpanderConfig.js';
import { StepBaseConfig, GlobalsConfig } from '../../config/schema.js';

export class UrlExpanderPlugin extends BasePlugin<UrlExpanderConfig> {
    readonly type = 'url-expander';

    constructor(private registry: UrlHandlerRegistry) {
        super();
    }

    getSchema(step: StepBaseConfig, globals: GlobalsConfig) {
        return UrlExpanderConfigSchema.transform(config => {
            return {
                ...config,
                id: config.id ?? `url-expander-${Date.now()}`,
            };
        });
    }

    getStepExtensionSchema() {
        return UrlExpanderStepExtension;
    }

    preprocessStep(step: any): any {
        if (step.expandUrls !== undefined && step.expandUrls !== false) {
            step.plugins = step.plugins || [];
            
            const isExplicitlyConfigured = step.plugins.some(
                (p: any) => p.type === 'url-expander'
            );

            if (!isExplicitlyConfigured) {
                let pluginConfig: any = {
                    type: 'url-expander',
                    output: { mode: 'ignore', explode: false },
                    mode: 'fetch',
                    maxChars: 30000
                };

                if (typeof step.expandUrls === 'object') {
                    pluginConfig = { ...pluginConfig, ...step.expandUrls };
                }

                step.plugins.unshift(pluginConfig);
            }
        }
        return step;
    }

    async prepare(stepRow: StepRow, config: UrlExpanderConfig): Promise<PluginPacket[]> {
        const { mode, maxChars } = config;
        const messages = stepRow.history;

        // Also check current step messages (which might contain the prompt with the URL)
        // Note: In the new architecture, stepRow.preparedMessages includes history + current model messages
        // But we want to modify the history *before* the model sees it, or modify the current message.
        // The UrlExpander logic is a bit unique: it modifies the *last user message* found in the combined set.
        
        // We access the hydrated model messages directly from the row
        // But StepRow doesn't expose them easily in a mutable way.
        // However, prepare returns a packet that can override history.
        
        // Let's construct the full conversation the model *would* see
        const currentMessages = await stepRow.getPreparedMessages();

        // Scan ONLY the last message for URLs to expand
        const lastMessageIndex = currentMessages.length - 1;
        const lastMessage = currentMessages[lastMessageIndex];

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

        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const turndownService = new TurndownService();
        turndownService.remove(['script', 'style', 'noscript', 'iframe']);

        // Resolve the generic handler based on mode
        const fallbackHandler = this.registry.getFallback(mode);

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
            // We need to return a packet that updates the history.
            // Since we modified the *last message* of the *combined* set,
            // we need to be careful.
            // If the last message was from history, we update history.
            // If it was from the current step's model config, we can't easily update it via packet.history alone
            // because packet.history replaces the *previous* history.
            
            // However, StepRow.preparedMessages combines history + model messages.
            // If we return a new history that includes EVERYTHING, it effectively overrides the context.
            
            // Let's reconstruct the full history with the modification.
            const newHistory = [...currentMessages];
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
