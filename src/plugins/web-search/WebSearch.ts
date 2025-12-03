import { z } from 'zod';
import PQueue from 'p-queue';
import { Fetcher } from '../../utils/createCachedFetcher.js';

// Zod Schemas for Serper
const SearchParametersSchema = z.object({
  q: z.string(),
  type: z.string().optional(),
  num: z.number().optional(),
  engine: z.string().optional(),
});

const OrganicResultSchema = z.object({
  title: z.string(),
  link: z.string(),
  snippet: z.string().optional(),
  position: z.number().optional(),
  date: z.string().optional(),
  sitelinks: z.array(z.object({ title: z.string(), link: z.string() })).optional(),
});

const SerperResponseSchema = z.object({
  searchParameters: SearchParametersSchema,
  organic: z.array(OrganicResultSchema).optional(),
});

export type WebSearchResult = z.infer<typeof OrganicResultSchema> & {
    content?: string; // Populated if mode is markdown/html
};

export type WebSearchMode = 'none' | 'markdown' | 'html';

export class WebSearch {
    constructor(
        private apiKey: string,
        private fetcher: Fetcher,
        private queue: PQueue
    ) {}

    async search(query: string, num: number = 5): Promise<WebSearchResult[]> {
        console.log(`[WebSearch] Searching for query: "${query}"`);

        const response = await this.queue.add(() => this.fetcher('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
                'X-API-KEY': this.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                q: query,
                num: num
            })
        }));

        if (!response) {
            throw new Error("Queue execution failed or returned undefined response.");
        }

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        
        try {
            const parsed = SerperResponseSchema.parse(json);
            return parsed.organic || [];
        } catch (e) {
            console.error("[WebSearch] Failed to parse Serper API response:", e);
            throw e;
        }
    }

    async fetchContent(url: string, mode: WebSearchMode): Promise<string> {
        if (mode === 'none') return '';

        try {
            const response = await this.fetcher(url, {
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });

            if (!response.ok) {
                console.warn(`[WebSearch] Failed to fetch ${url}: ${response.status}`);
                return '';
            }

            const html = await response.text();

            if (mode === 'html') return html;
            if (mode === 'markdown') return this.htmlToMarkdown(html);
            
            return '';
        } catch (e: any) {
            console.warn(`[WebSearch] Error fetching ${url}: ${e.message}`);
            return '';
        }
    }

    private htmlToMarkdown(html: string): string {
        // Very basic HTML to Markdown stripper
        let text = html;
        
        // Remove scripts and styles
        text = text.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "");
        text = text.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "");
        
        // Headers
        text = text.replace(/<h1\b[^>]*>(.*?)<\/h1>/gim, "\n# $1\n");
        text = text.replace(/<h2\b[^>]*>(.*?)<\/h2>/gim, "\n## $1\n");
        text = text.replace(/<h3\b[^>]*>(.*?)<\/h3>/gim, "\n### $1\n");
        
        // Links
        text = text.replace(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gim, "[$2]($1)");
        
        // Paragraphs
        text = text.replace(/<p\b[^>]*>/gim, "\n");
        text = text.replace(/<\/p>/gim, "\n");
        
        // Lists
        text = text.replace(/<li\b[^>]*>/gim, "\n- ");
        
        // Strip remaining tags
        text = text.replace(/<[^>]+>/g, '');
        
        // Collapse whitespace
        text = text.replace(/\s+/g, ' ').trim();
        
        return text;
    }
}
