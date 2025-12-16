import OpenAI from 'openai';
import TurndownService from 'turndown';
import { PromptPreprocessorPlugin, PreprocessorContext } from './types.js';
import { UrlHandlerRegistry } from './expander/UrlHandlerRegistry.js';
import { PreprocessorConfigDefinition } from '../types.js';

export class UrlExpanderPlugin implements PromptPreprocessorPlugin {
    name = 'url-expander';
    flagName = 'expand-urls';

    constructor(private registry: UrlHandlerRegistry) {}

    register(program: any): void {
        program.option(`--${this.flagName}`, `Enable URL expansion in prompts`);
        program.option(`--${this.flagName}-mode <mode>`, `Expansion mode (fetch, puppeteer)`, 'puppeteer');
        program.option(`--${this.flagName}-max-chars <number>`, `Max characters per expanded URL`, '30000');
    }

    registerStep(program: any, stepIndex: number): void {
        program.option(`--${this.flagName}-${stepIndex}`, `Enable URL expansion for step ${stepIndex}`);
        program.option(`--${this.flagName}-mode-${stepIndex} <mode>`, `Expansion mode for step ${stepIndex}`);
        program.option(`--${this.flagName}-max-chars-${stepIndex} <number>`, `Max characters per expanded URL for step ${stepIndex}`);
    }

    normalize(options: Record<string, any>, stepIndex: number, globalConfig: any): PreprocessorConfigDefinition | undefined {
        const camelFlag = this.toCamel(this.flagName);
        const stepCamelFlag = this.toCamel(`${this.flagName}-${stepIndex}`);
        
        const isEnabled = options[camelFlag] || options[stepCamelFlag];
        if (!isEnabled) return undefined;

        // Determine mode - default to 'puppeteer'
        const modeKey = this.toCamel(`${this.flagName}-mode`);
        const stepModeKey = this.toCamel(`${this.flagName}-mode-${stepIndex}`);
        const mode = options[stepModeKey] || options[modeKey] || 'puppeteer';

        // Determine max chars
        const maxCharsKey = this.toCamel(`${this.flagName}-max-chars`);
        const stepMaxCharsKey = this.toCamel(`${this.flagName}-max-chars-${stepIndex}`);
        const maxChars = parseInt(options[stepMaxCharsKey] || options[maxCharsKey] || '30000', 10);

        return {
            name: this.name,
            config: {
                mode,
                maxChars
            }
        };
    }

    async process(
        parts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        context: PreprocessorContext,
        config: any
    ): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        
        const { mode, maxChars } = config;

        // Resolve the generic handler based on mode
        const fallbackHandler = this.registry.getFallback(mode);

        const newParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        
        // Regex to find http/https URLs. 
        // We capture broadly (non-whitespace) and then clean up trailing punctuation in the loop.
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
                // Strip common trailing punctuation often found in sentences
                while (true) {
                    const lastChar = url.charAt(url.length - 1);
                    
                    // Remove trailing sentence punctuation
                    if (/[.,!?;:]/.test(lastChar)) {
                        url = url.slice(0, -1);
                        continue;
                    }
                    
                    // Remove trailing closing parenthesis only if unbalanced
                    // e.g. "Check (http://site.com)" -> "http://site.com"
                    // e.g. "http://site.com/foo(bar)" -> "http://site.com/foo(bar)"
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

    private toCamel(s: string) {
        return s.replace(/-([a-z0-9])/g, (g) => g[1].toUpperCase());
    }
}
