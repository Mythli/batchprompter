import OpenAI from 'openai';
import TurndownService from 'turndown';
import { PromptPreprocessorPlugin, PreprocessorContext } from './types.js';
import { PreprocessorConfigDefinition } from '../types.js';

export abstract class UrlExpanderBase implements PromptPreprocessorPlugin {
    abstract name: string;
    abstract flagName: string;

    abstract fetchContent(url: string, context: PreprocessorContext): Promise<string | null>;

    register(program: any): void {
        program.option(`--${this.flagName}`, `Enable ${this.name} to expand URLs in prompts`);
    }

    registerStep(program: any, stepIndex: number): void {
        program.option(`--${this.flagName}-${stepIndex}`, `Enable ${this.name} to expand URLs in prompts for step ${stepIndex}`);
    }

    normalize(options: Record<string, any>, stepIndex: number, globalConfig: any): PreprocessorConfigDefinition | undefined {
        const camelFlag = this.toCamel(this.flagName);
        const stepCamelFlag = this.toCamel(`${this.flagName}-${stepIndex}`);
        
        const isEnabled = options[camelFlag] || options[stepCamelFlag];
        if (!isEnabled) return undefined;

        return {
            name: this.name,
            config: {}
        };
    }

    async process(
        parts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        context: PreprocessorContext,
        config: any
    ): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        // Config is empty for base, but we rely on normalize having returned it to know we are active.
        
        const newParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        // Regex to find http/https URLs
        // Excludes closing parenthesis to avoid capturing markdown link syntax like [text](url) incorrectly if simple
        const urlRegex = /(https?:\/\/[^\s)]+)/g;
        const turndownService = new TurndownService();

        // Remove scripts and styles from markdown conversion
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

            // Filter unique URLs
            const uniqueUrls = [...new Set(urls)];
            const expansions: string[] = [];

            for (const url of uniqueUrls) {
                try {
                    console.log(`[${this.name}] Expanding URL: ${url}`);
                    const html = await this.fetchContent(url, context);
                    if (html) {
                        const markdown = turndownService.turndown(html);
                        const truncated = markdown.substring(0, 15000); // Safety limit
                        expansions.push(`\n\n--- Content of ${url} ---\n${truncated}\n--------------------------\n`);
                    }
                } catch (e: any) {
                    console.warn(`[${this.name}] Failed to expand ${url}: ${e.message}`);
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
