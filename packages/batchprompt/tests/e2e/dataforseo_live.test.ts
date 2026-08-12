import { describe, expect, it } from 'vitest';
import { initConfig } from '../../src/getDiContainer.js';
import { parseDataForSeoResponse } from '../../src/plugins/web-search/DataForSeoWebSearch.js';
import { setupTestEnvironment } from '../utils/testUtils.js';

const hasCredentials = Boolean(
    process.env.BATCHPROMPT_DATAFORSEO_AUTH_TOKEN
    || process.env.DATAFORSEO_AUTH_TOKEN
    || (
        (process.env.BATCHPROMPT_DATAFORSEO_LOGIN || process.env.DATAFORSEO_LOGIN)
        && (process.env.BATCHPROMPT_DATAFORSEO_PASSWORD || process.env.DATAFORSEO_PASSWORD)
    )
);

describe.skipIf(!hasCredentials)('DataForSEO live', () => {
    it('constructs the provider, returns live results, and maps the paid sandbox contract', async () => {
        const deps = await initConfig({
            ...process.env,
            CACHE_ENABLED: false
        });
        const provider = deps.webSearchProviders.dataforseo;
        if (!provider) {
            throw new Error('DataForSEO provider was not constructed.');
        }

        try {
            const liveResults = await provider.search(
                'car insurance quotes',
                10,
                1,
                'us',
                'en',
                true
            );
            expect(liveResults.some(result => result.type === 'seo')).toBe(true);

            const pipelineProvider = {
                provider: 'dataforseo' as const,
                search: async () => liveResults,
                fetchContent: provider.fetchContent.bind(provider)
            };
            const { executor } = setupTestEnvironment({
                webSearchProviders: {
                    dataforseo: pipelineProvider
                }
            });
            const pipelineResult = await executor.runConfig({
                steps: [{
                    plugins: [{
                        type: 'webSearch',
                        provider: 'dataforseo',
                        includeAds: true,
                        query: 'car insurance quotes',
                        limit: 20,
                        gl: 'us',
                        hl: 'en',
                        output: {
                            mode: 'merge',
                            explode: true
                        }
                    }]
                }]
            }, [{ source: 'live-test' }]);
            expect(pipelineResult.results.some(
                result => result.webSearch?.type === 'seo'
            )).toBe(true);

            const configuredToken = process.env.BATCHPROMPT_DATAFORSEO_AUTH_TOKEN
                || process.env.DATAFORSEO_AUTH_TOKEN;
            const login = process.env.BATCHPROMPT_DATAFORSEO_LOGIN
                || process.env.DATAFORSEO_LOGIN;
            const password = process.env.BATCHPROMPT_DATAFORSEO_PASSWORD
                || process.env.DATAFORSEO_PASSWORD;
            const authToken = configuredToken?.replace(/^Basic\s+/i, '')
                || Buffer.from(`${login}:${password}`, 'utf8').toString('base64');

            const sandboxResponse = await fetch(
                'https://sandbox.dataforseo.com/v3/serp/google/organic/task_get/regular/'
                + '00000000-0000-0000-0000-000000000000',
                {
                    headers: {
                        Authorization: `Basic ${authToken}`
                    }
                }
            );
            expect(sandboxResponse.ok).toBe(true);

            const sandboxResults = parseDataForSeoResponse(
                await sandboxResponse.json(),
                {
                    num: 10,
                    includeAds: true
                }
            );
            expect(sandboxResults.some(result => result.type === 'seo')).toBe(true);
            expect(sandboxResults.some(result => result.type === 'ad')).toBe(true);
        } finally {
            await deps.puppeteerHelper.close();
        }
    }, 60_000);
});
