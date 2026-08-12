import { describe, expect, it, vi } from 'vitest';
import { setupTestEnvironment } from '../utils/testUtils.js';
import type { WebSearchProvider } from '../../src/plugins/web-search/WebSearchProvider.js';

describe('webSearch provider selection', () => {
    it('routes includeAds to the selected Puppeteer provider', async () => {
        const search = vi.fn().mockResolvedValue([{
            title: 'Sponsored result',
            link: 'https://advertiser.example/offer',
            snippet: 'Sponsored copy',
            position: 1,
            type: 'ad'
        }]);
        const puppeteerProvider: WebSearchProvider = {
            provider: 'puppeteer',
            search,
            fetchContent: vi.fn().mockResolvedValue('')
        };
        const { executor } = setupTestEnvironment({
            webSearchProviders: {
                puppeteer: puppeteerProvider
            }
        });

        const { results } = await executor.runConfig({
            steps: [{
                plugins: [{
                    type: 'webSearch',
                    provider: 'puppeteer',
                    includeAds: true,
                    query: 'running shoes',
                    limit: 5,
                    output: {
                        mode: 'merge',
                        explode: true
                    }
                }]
            }]
        }, [{ source: 'test' }]);

        expect(search).toHaveBeenCalledWith(
            'running shoes',
            10,
            1,
            undefined,
            undefined,
            true
        );
        expect(results).toEqual([{
            source: 'test',
            webSearch: {
                title: 'Sponsored result',
                link: 'https://advertiser.example/offer',
                snippet: 'Sponsored copy',
                position: 1,
                type: 'ad',
                content: 'Sponsored copy',
                domain: 'advertiser.example'
            }
        }]);
    });

    it('routes includeAds to the selected DataForSEO provider', async () => {
        const search = vi.fn().mockResolvedValue([{
            title: 'Structured paid result',
            link: 'https://advertiser.example/dataforseo',
            snippet: 'Paid copy',
            position: 1,
            type: 'ad'
        }]);
        const dataForSeoProvider: WebSearchProvider = {
            provider: 'dataforseo',
            search,
            fetchContent: vi.fn().mockResolvedValue('')
        };
        const { executor } = setupTestEnvironment({
            webSearchProviders: {
                dataforseo: dataForSeoProvider
            }
        });

        const { results } = await executor.runConfig({
            steps: [{
                plugins: [{
                    type: 'webSearch',
                    provider: 'dataforseo',
                    includeAds: true,
                    query: 'car insurance quotes',
                    limit: 5,
                    output: {
                        mode: 'merge',
                        explode: true
                    }
                }]
            }]
        }, [{ source: 'test' }]);

        expect(search).toHaveBeenCalledWith(
            'car insurance quotes',
            10,
            1,
            undefined,
            undefined,
            true
        );
        expect(results).toEqual([{
            source: 'test',
            webSearch: {
                title: 'Structured paid result',
                link: 'https://advertiser.example/dataforseo',
                snippet: 'Paid copy',
                position: 1,
                type: 'ad',
                content: 'Paid copy',
                domain: 'advertiser.example'
            }
        }]);
    });
});
