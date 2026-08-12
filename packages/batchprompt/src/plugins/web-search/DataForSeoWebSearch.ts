import { z } from 'zod';
import PQueue from 'p-queue';
import type { Fetcher } from 'llm-fns';
import {
    BaseWebSearchProvider,
    WebSearchResult
} from './WebSearchProvider.js';

const DATA_FOR_SEO_ENDPOINT = 'https://api.dataforseo.com/v3/serp/google/organic/live/advanced';
const DEFAULT_LOCATION_CODE = 2840;
const MAX_DEPTH = 200;

const LinkElementSchema = z.object({
    title: z.string(),
    url: z.string()
});

const SerpItemSchema = z.object({
    type: z.string(),
    rank_group: z.number().nullish(),
    rank_absolute: z.number().nullish(),
    page: z.number().nullish(),
    domain: z.string().nullish(),
    title: z.string().nullish(),
    url: z.string().nullish(),
    description: z.string().nullish(),
    timestamp: z.string().nullish(),
    links: z.array(LinkElementSchema).nullish()
});

const SerpResultSchema = z.object({
    items: z.array(SerpItemSchema).nullish()
});

const TaskSchema = z.object({
    status_code: z.number(),
    status_message: z.string(),
    result: z.array(SerpResultSchema).nullish()
});

const DataForSeoResponseSchema = z.object({
    status_code: z.number(),
    status_message: z.string(),
    tasks: z.array(TaskSchema).nullish()
});

export type DataForSeoCredentials =
    | { login: string; password: string; authToken?: never }
    | { authToken: string; login?: never; password?: never };

export class DataForSeoApiError extends Error {
    constructor(
        message: string,
        public readonly statusCode?: number
    ) {
        super(message);
        this.name = 'DataForSeoApiError';
    }
}

function normalizeAuthToken(credentials: DataForSeoCredentials): string {
    if (credentials.authToken) {
        return credentials.authToken.replace(/^Basic\s+/i, '').trim();
    }

    return Buffer.from(
        `${credentials.login}:${credentials.password}`,
        'utf8'
    ).toString('base64');
}

function getLocationParameters(gl?: string): { location_code: number } | { location_name: string } {
    if (!gl) return { location_code: DEFAULT_LOCATION_CODE };

    const normalizedCode = gl.trim().toUpperCase() === 'UK'
        ? 'GB'
        : gl.trim().toUpperCase();

    if (!/^[A-Z]{2}$/.test(normalizedCode)) {
        throw new Error(`Invalid Google country code "${gl}". Expected a two-letter country code.`);
    }

    const locationName = new Intl.DisplayNames(['en'], { type: 'region' }).of(normalizedCode);
    if (!locationName || locationName === normalizedCode) {
        throw new Error(`Unable to map Google country code "${gl}" to a DataForSEO location.`);
    }

    return { location_name: locationName };
}

function getLanguageCode(hl?: string): string {
    return (hl || 'en').trim().split(/[-_]/)[0].toLowerCase();
}

function itemBelongsToPage(
    item: z.infer<typeof SerpItemSchema>,
    page: number,
    num: number
): boolean {
    if (item.page != null) return item.page === page;

    const rank = item.rank_group ?? item.rank_absolute;
    if (rank == null) return page === 1;

    const start = (page - 1) * num + 1;
    return rank >= start && rank < start + num;
}

function mapItem(item: z.infer<typeof SerpItemSchema>): WebSearchResult {
    return {
        title: item.title!,
        link: item.url!,
        snippet: item.description || undefined,
        position: item.rank_absolute ?? item.rank_group ?? undefined,
        date: item.timestamp || undefined,
        sitelinks: item.links?.map(link => ({
            title: link.title,
            link: link.url
        })),
        domain: item.domain || undefined,
        type: item.type === 'paid' ? 'ad' : 'seo'
    };
}

export function parseDataForSeoResponse(
    rawResponse: unknown,
    options: {
        num: number;
        page?: number;
        includeAds: boolean;
    }
): WebSearchResult[] {
    const parsed = DataForSeoResponseSchema.parse(rawResponse);
    if (parsed.status_code !== 20000) {
        throw new DataForSeoApiError(
            `DataForSEO API error ${parsed.status_code}: ${parsed.status_message}`,
            parsed.status_code
        );
    }

    const task = parsed.tasks?.[0];
    if (!task) {
        throw new DataForSeoApiError('DataForSEO response did not contain a task.');
    }
    if (task.status_code !== 20000) {
        throw new DataForSeoApiError(
            `DataForSEO task error ${task.status_code}: ${task.status_message}`,
            task.status_code
        );
    }

    const pageItems = (task.result?.[0]?.items || [])
        .filter(item => ['organic', 'paid'].includes(item.type))
        .filter(item => item.title && item.url)
        .filter(item => (
            options.page == null
            || itemBelongsToPage(item, options.page, options.num)
        ));

    const organicItems = pageItems
        .filter(item => item.type === 'organic')
        .slice(0, options.num);
    const paidItems = options.includeAds
        ? pageItems.filter(item => item.type === 'paid')
        : [];

    return [...organicItems, ...paidItems]
        .sort((left, right) => (
            (left.rank_absolute ?? Number.MAX_SAFE_INTEGER)
            - (right.rank_absolute ?? Number.MAX_SAFE_INTEGER)
        ))
        .map(mapItem);
}

export class DataForSeoWebSearch extends BaseWebSearchProvider {
    readonly provider = 'dataforseo' as const;
    private readonly authToken: string;

    constructor(
        credentials: DataForSeoCredentials,
        fetcher: Fetcher,
        queue: PQueue
    ) {
        super(fetcher, queue);
        this.authToken = normalizeAuthToken(credentials);
    }

    async search(
        query: string,
        num: number = 5,
        page: number = 1,
        gl?: string,
        hl?: string,
        includeAds: boolean = false
    ): Promise<WebSearchResult[]> {
        if (!Number.isInteger(num) || num < 1) {
            throw new RangeError('DataForSEO result count must be a positive integer.');
        }
        if (!Number.isInteger(page) || page < 1) {
            throw new RangeError('DataForSEO page must be a positive integer.');
        }

        const depth = Math.max(10, num * page);
        if (depth > MAX_DEPTH) {
            throw new RangeError(
                `DataForSEO can retrieve at most ${MAX_DEPTH} results; requested depth was ${depth}.`
            );
        }

        const response = await this.queue.add(() => this.fetcher(DATA_FOR_SEO_ENDPOINT, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${this.authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([{
                keyword: query,
                ...getLocationParameters(gl),
                language_code: getLanguageCode(hl),
                device: 'desktop',
                os: 'windows',
                depth,
                max_crawl_pages: page
            }])
        }));

        if (!response) {
            throw new DataForSeoApiError('DataForSEO queue execution returned no response.');
        }

        if (!response.ok) {
            throw new DataForSeoApiError(
                `DataForSEO HTTP request failed: ${response.status} ${response.statusText}`,
                response.status
            );
        }

        return parseDataForSeoResponse(await response.json(), {
            num,
            page,
            includeAds
        });
    }
}
