import OpenAI from 'openai';
import TurndownService from 'turndown';
import { PromptPreprocessorPlugin, PreprocessorContext } from './types.js';
import { UrlHandlerRegistry } from './expander/UrlHandlerRegistry.js';

export class UrlExpanderPlugin implements PromptPreprocessorPlugin {
    name = 'url-expander';
    flagName = 'expand-urls';

    constructor(private registry: UrlHandlerRegistry) {}

    register(program: any): void {
        program.option(`--${this.flagName}`, `Enable URL expansion in prompts`);
        program.option(`--${this.flagName}-mode <mode>`, `Expansion mode (auto, fetch, puppeteer)`, 'auto');
    }

    registerStep(program: any, stepIndex: number): void {
        program.option(`--${this.flagName}-${stepIndex}`, `Enable URL expansion for step ${stepIndex}`);
        program.option(`--${this.flagName}-mode-${stepIndex} <mode>`, `Expansion mode for step ${stepIndex}`);
    }

    async process(
        parts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        context: PreprocessorContext
    ): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        
        const camelFlag = this.toCamel(this.flagName);
        const stepCamelFlag = this.toCamel(`${this.flagName}-${context.stepIndex}`);
        
        const isEnabled = context.options[camelFlag] || context.options[stepCamelFlag];
        if (!isEnabled) return parts;

        // Determine mode
        const modeKey = this.toCamel(`${this.flagName}-mode`);
        const stepModeKey = this.toCamel(`${this.flagName}-mode-${context.stepIndex}`);
        const mode = context.options[stepModeKey] || context.options[modeKey] || 'auto';

        // Resolve the generic handler based on mode
        const fallbackHandler = this.registry.getFallback(mode);

        const newParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        // Regex to find http/https URLs
        // Excludes closing parenthesis to avoid capturing markdown link syntax like [text](url) incorrectly if simple
        const urlRegex = /(https?:\/\/[^\s)]+)/g;
        
        const turndownService = new TurndownService();
        turndownService.remove(['script', 'style', 'noscript', 'iframe']);

        for (const part of parts) {
            if (part.type !== 'text') {
                newParts.push(part);
                continue;
            }

            const text = part.text;
            const urls = text.match(urlRegex);

            if (!urls || urls.length === 0) {
                newParts.push(part);
                continue;
            }

            const uniqueUrls = [...new Set(urls)];
            const expansions: string[] = [];

            for (const url of uniqueUrls) {
                try {
                    let content: string | null = null;
                    let handlerName = 'unknown';

                    // 1. Check Specific Handlers (Priority)
                    const specificHandler = this.registry.getSpecificHandler(url);
                    if (specificHandler) {
                        handlerName = specificHandler.name;
                        // Specific handlers return processed Markdown
                        // Pass the fallbackHandler (generic) to the specific handler
                        content = await specificHandler.handle(url, context.services, fallbackHandler);
                    } else {
                        // 2. Fallback based on mode
                        handlerName = fallbackHandler.name;
                        
                        // Generic handlers return raw HTML
                        const rawHtml = await fallbackHandler.handle(url, context.services);
                        if (rawHtml) {
                            // Convert HTML to Markdown
                            content = turndownService.turndown(rawHtml);
                        }
                    }

                    if (content) {
                        console.log(`[UrlExpander] Expanded ${url} using ${handlerName}`);
                        const truncated = content.substring(0, 15000);
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

    private toCamel(s: string) {
        return s.replace(/-([a-z0-9])/g, (g) => g[1].toUpperCase());
    }
}
