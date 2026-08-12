import { describe, expect, it, vi } from 'vitest';
import PQueue from 'p-queue';
import { AiWebSearch } from './AiWebSearch.js';
import { SerperWebSearch } from './SerperWebSearch.js';
import { UnsupportedWebSearchOptionError } from './WebSearchProvider.js';

describe('SerperWebSearch', () => {
    it('rejects includeAds before making an API request', async () => {
        const fetcher = vi.fn();
        const search = new SerperWebSearch(
            'test-key',
            fetcher as any,
            new PQueue({ concurrency: 1 })
        );

        await expect(
            search.search('running shoes', 10, 1, 'de', 'de', true)
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'UnsupportedWebSearchOptionError',
                provider: 'serper',
                option: 'includeAds'
            })
        );
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('lets the unsupported option error escape the AI scatter layer', async () => {
        const search = new SerperWebSearch(
            'test-key',
            vi.fn() as any,
            new PQueue({ concurrency: 1 })
        );
        const aiSearch = new AiWebSearch(search);

        await expect(aiSearch.process({}, {
            query: 'running shoes',
            limit: 5,
            chunkSize: 10,
            mode: 'none',
            queryCount: 1,
            maxPages: 1,
            dedupeStrategy: 'none',
            includeAds: true
        })).rejects.toBeInstanceOf(UnsupportedWebSearchOptionError);
    });

    it('maps organic Serper results to the common result shape', async () => {
        const fetcher = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                searchParameters: {
                    q: 'running shoes',
                    num: 10,
                    page: 2
                },
                organic: [{
                    title: 'Organic result',
                    link: 'https://example.com/shoes',
                    snippet: 'A normal organic search result.',
                    position: 1
                }]
            })
        });
        const search = new SerperWebSearch(
            'test-key',
            fetcher as any,
            new PQueue({ concurrency: 1 })
        );

        await expect(search.search('running shoes', 10, 2)).resolves.toEqual([{
            title: 'Organic result',
            link: 'https://example.com/shoes',
            snippet: 'A normal organic search result.',
            position: 11,
            type: 'seo'
        }]);
    });
});
