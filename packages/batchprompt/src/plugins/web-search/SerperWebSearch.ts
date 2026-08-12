import { z } from 'zod';
import PQueue from 'p-queue';
import type { Fetcher } from 'llm-fns';
import {
    BaseWebSearchProvider,
    UnsupportedWebSearchOptionError,
    WebSearchResult
} from './WebSearchProvider.js';

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

export class SerperWebSearch extends BaseWebSearchProvider {
    readonly provider = 'serper' as const;

    constructor(
        private readonly apiKey: string,
        fetcher: Fetcher,
        queue: PQueue
    ) {
        super(fetcher, queue);
    }

    async search(
        query: string,
        num: number = 5,
        page: number = 1,
        gl?: string,
        hl?: string,
        includeAds: boolean = false
    ): Promise<WebSearchResult[]> {
        if (includeAds) {
            throw new UnsupportedWebSearchOptionError(this.provider, 'includeAds');
        }

        const response = await this.queue.add(() => this.fetcher('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
                'X-API-KEY': this.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                q: query,
                num,
                page,
                gl,
                hl
            })
        }));

        if (!response) {
            throw new Error('Queue execution failed or returned undefined response.');
        }

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const parsed = SerperResponseSchema.parse(await response.json());
        return (parsed.organic || []).map((result, index) => ({
            ...result,
            position: (page - 1) * num + (result.position || index + 1),
            type: 'seo' as const
        }));
    }
}
