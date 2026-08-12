import { describe, expect, it } from 'vitest';
import { initConfig } from './getDiContainer.js';

describe('initConfig web-search providers', () => {
    it('constructs DataForSEO when credentials are configured', async () => {
        const deps = await initConfig({
            AI_API_KEY: 'test-ai-key',
            CACHE_ENABLED: false,
            BATCHPROMPT_DATAFORSEO_LOGIN: 'api@example.com',
            BATCHPROMPT_DATAFORSEO_PASSWORD: 'secret'
        });

        expect(deps.capabilities.hasDataForSeo).toBe(true);
        expect(deps.webSearchProviders.dataforseo?.provider).toBe('dataforseo');

        await deps.puppeteerHelper.close();
    });

    it('rejects a partial DataForSEO credential pair', async () => {
        await expect(initConfig({
            AI_API_KEY: 'test-ai-key',
            CACHE_ENABLED: false,
            BATCHPROMPT_DATAFORSEO_LOGIN: 'api@example.com'
        })).rejects.toThrow(
            'DataForSEO requires both BATCHPROMPT_DATAFORSEO_LOGIN'
        );
    });
});
