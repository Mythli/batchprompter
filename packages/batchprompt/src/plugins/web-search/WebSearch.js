import { z } from 'zod';
import TurndownService from 'turndown';
// Zod Schemas for Serper
const SearchParametersSchema = z.object({
    q: z.string(),
    type: z.string().optional(),
    num: z.number().optional(),
    page: z.number().optional(),
    engine: z.string().optional(),
    gl: z.string().optional(),
    hl: z.string().optional(),
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
export class WebSearch {
    apiKey;
    fetcher;
    queue;
    constructor(apiKey, fetcher, queue) {
        this.apiKey = apiKey;
        this.fetcher = fetcher;
        this.queue = queue;
    }
    async search(query, num = 5, page = 1, gl, hl) {
        console.log(`[WebSearch] Searching for query: "${query}" (Page: ${page}, Limit: ${num}, GL: ${gl}, HL: ${hl})`);
        const response = await this.queue.add(() => this.fetcher('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
                'X-API-KEY': this.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                q: query,
                num: num,
                page: page,
                gl: gl,
                hl: hl
            })
        }));
        if (!response) {
            throw new Error("Queue execution failed or returned undefined response.");
        }
        if (!response.ok) {
            const data = await response.text();
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        const json = await response.json();
        try {
            const parsed = SerperResponseSchema.parse(json);
            const organic = (parsed.organic || []).map((r, index) => ({
                ...r,
                position: (page - 1) * num + (r.position || (index + 1)),
                type: 'seo'
            }));
            return organic;
        }
        catch (e) {
            console.error("[WebSearch] Failed to parse Serper API response:", e);
            throw e;
        }
    }
    async fetchContent(url, mode) {
        if (mode === 'none')
            return '';
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
            if (mode === 'html')
                return html;
            if (mode === 'markdown')
                return this.htmlToMarkdown(html);
            return '';
        }
        catch (e) {
            console.warn(`[WebSearch] Error fetching ${url}: ${e.message}`);
            return '';
        }
    }
    htmlToMarkdown(html) {
        const turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced'
        });
        // Remove scripts, styles, and other non-content elements
        turndownService.remove(['script', 'style', 'noscript', 'iframe']);
        return turndownService.turndown(html);
    }
}
//# sourceMappingURL=WebSearch.js.map