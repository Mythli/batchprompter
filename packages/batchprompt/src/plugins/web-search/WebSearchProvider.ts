import PQueue from 'p-queue';
import TurndownService from 'turndown';
import type { Fetcher } from 'llm-fns';

export type WebSearchProviderName = 'serper' | 'puppeteer' | 'dataforseo';
export type WebSearchMode = 'none' | 'markdown' | 'html';
export type WebSearchResultType = 'seo' | 'ad';

export interface WebSearchResult {
    title: string;
    link: string;
    snippet?: string;
    position?: number;
    date?: string;
    sitelinks?: Array<{ title: string; link: string }>;
    content?: string;
    domain?: string;
    type: WebSearchResultType;
}

export interface WebSearchProvider {
    readonly provider: WebSearchProviderName;

    search(
        query: string,
        num?: number,
        page?: number,
        gl?: string,
        hl?: string,
        includeAds?: boolean
    ): Promise<WebSearchResult[]>;

    fetchContent(url: string, mode: WebSearchMode): Promise<string>;
}

export type WebSearchProviderMap = Partial<Record<WebSearchProviderName, WebSearchProvider>>;

export class UnsupportedWebSearchOptionError extends Error {
    constructor(
        public readonly provider: WebSearchProviderName,
        public readonly option: string
    ) {
        super(`Web search provider "${provider}" does not support "${option}".`);
        this.name = 'UnsupportedWebSearchOptionError';
    }
}

export abstract class BaseWebSearchProvider implements WebSearchProvider {
    abstract readonly provider: WebSearchProviderName;

    constructor(
        protected readonly fetcher: Fetcher,
        protected readonly queue: PQueue
    ) {}

    abstract search(
        query: string,
        num?: number,
        page?: number,
        gl?: string,
        hl?: string,
        includeAds?: boolean
    ): Promise<WebSearchResult[]>;

    async fetchContent(url: string, mode: WebSearchMode): Promise<string> {
        if (mode === 'none') return '';

        try {
            const response = await this.fetcher(url, {
                headers: {
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });

            if (!response.ok) return '';

            const html = await response.text();
            if (mode === 'html') return html;
            if (mode === 'markdown') return this.htmlToMarkdown(html);
            return '';
        } catch {
            return '';
        }
    }

    private htmlToMarkdown(html: string): string {
        const turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced'
        });

        turndownService.remove(['script', 'style', 'noscript', 'iframe']);
        return turndownService.turndown(html);
    }
}
