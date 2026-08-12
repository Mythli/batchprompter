import { describe, expect, it, vi } from 'vitest';
import PQueue from 'p-queue';
import { DataForSeoWebSearch } from './DataForSeoWebSearch.js';

function createResponse(body: unknown) {
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => body
    };
}

function createSuccessfulBody(items: unknown[]) {
    return {
        status_code: 20000,
        status_message: 'Ok.',
        tasks: [{
            status_code: 20000,
            status_message: 'Ok.',
            result: [{ items }]
        }]
    };
}

describe('DataForSeoWebSearch', () => {
    it('maps paid and organic results from the requested page', async () => {
        const fetcher = vi.fn().mockResolvedValue(createResponse(
            createSuccessfulBody([
                {
                    type: 'organic',
                    rank_group: 1,
                    rank_absolute: 1,
                    page: 1,
                    title: 'First-page result',
                    url: 'https://page-one.example/'
                },
                {
                    type: 'paid',
                    rank_group: 1,
                    rank_absolute: 11,
                    page: 2,
                    domain: 'advertiser.example',
                    title: 'Sponsored result',
                    url: 'https://advertiser.example/offer',
                    description: 'Sponsored copy',
                    links: [{
                        title: 'Pricing',
                        url: 'https://advertiser.example/pricing'
                    }]
                },
                {
                    type: 'organic',
                    rank_group: 11,
                    rank_absolute: 12,
                    page: 2,
                    domain: 'organic.example',
                    title: 'Organic result',
                    url: 'https://organic.example/article',
                    description: 'Organic copy'
                }
            ])
        ));
        const search = new DataForSeoWebSearch(
            { login: 'api@example.com', password: 'secret' },
            fetcher as any,
            new PQueue({ concurrency: 1 })
        );

        await expect(
            search.search('running shoes', 10, 2, 'de', 'de-DE', true)
        ).resolves.toEqual([
            {
                title: 'Sponsored result',
                link: 'https://advertiser.example/offer',
                snippet: 'Sponsored copy',
                position: 11,
                date: undefined,
                sitelinks: [{
                    title: 'Pricing',
                    link: 'https://advertiser.example/pricing'
                }],
                domain: 'advertiser.example',
                type: 'ad'
            },
            {
                title: 'Organic result',
                link: 'https://organic.example/article',
                snippet: 'Organic copy',
                position: 12,
                date: undefined,
                sitelinks: undefined,
                domain: 'organic.example',
                type: 'seo'
            }
        ]);

        const [url, init] = fetcher.mock.calls[0];
        expect(url).toBe('https://api.dataforseo.com/v3/serp/google/organic/live/advanced');
        expect(init.headers.Authorization).toBe(
            `Basic ${Buffer.from('api@example.com:secret').toString('base64')}`
        );
        expect(JSON.parse(init.body)).toEqual([{
            keyword: 'running shoes',
            location_name: 'Germany',
            language_code: 'de',
            device: 'desktop',
            os: 'windows',
            depth: 20,
            max_crawl_pages: 2
        }]);
    });

    it('excludes paid results unless includeAds is enabled', async () => {
        const fetcher = vi.fn().mockResolvedValue(createResponse(
            createSuccessfulBody([
                {
                    type: 'paid',
                    rank_group: 1,
                    rank_absolute: 1,
                    page: 1,
                    title: 'Sponsored',
                    url: 'https://advertiser.example/'
                },
                {
                    type: 'organic',
                    rank_group: 1,
                    rank_absolute: 2,
                    page: 1,
                    title: 'Organic',
                    url: 'https://organic.example/'
                }
            ])
        ));
        const search = new DataForSeoWebSearch(
            { authToken: 'Basic pre-encoded-token' },
            fetcher as any,
            new PQueue({ concurrency: 1 })
        );

        await expect(search.search('query')).resolves.toEqual([
            expect.objectContaining({
                title: 'Organic',
                type: 'seo'
            })
        ]);

        const [, init] = fetcher.mock.calls[0];
        expect(init.headers.Authorization).toBe('Basic pre-encoded-token');
        expect(JSON.parse(init.body)).toEqual([
            expect.objectContaining({
                location_code: 2840,
                language_code: 'en',
                depth: 10
            })
        ]);
    });

    it('surfaces task-level API failures', async () => {
        const fetcher = vi.fn().mockResolvedValue(createResponse({
            status_code: 20000,
            status_message: 'Ok.',
            tasks: [{
                status_code: 40101,
                status_message: 'Authentication failed.',
                result: null
            }]
        }));
        const search = new DataForSeoWebSearch(
            { authToken: 'token' },
            fetcher as any,
            new PQueue({ concurrency: 1 })
        );

        await expect(search.search('query')).rejects.toEqual(
            expect.objectContaining({
                name: 'DataForSeoApiError',
                statusCode: 40101
            })
        );
    });

    it('rejects pagination beyond the DataForSEO depth limit before billing', async () => {
        const fetcher = vi.fn();
        const search = new DataForSeoWebSearch(
            { authToken: 'token' },
            fetcher as any,
            new PQueue({ concurrency: 1 })
        );

        await expect(search.search('query', 10, 21)).rejects.toThrow(
            'DataForSEO can retrieve at most 200 results'
        );
        expect(fetcher).not.toHaveBeenCalled();
    });
});
