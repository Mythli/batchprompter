import { describe, expect, it } from 'vitest';
import {
    parseDemoEnv,
    resolveDemoOptions,
    type DemoCliOptions,
} from '../demo/index.js';

const cliOptions: DemoCliOptions = {
    websiteUrl: 'https://example.test/',
    outputDir: '/tmp/example',
    maxLogosToAnalyze: 10,
    brandLogoScoreThreshold: 1,
    headless: true,
    json: false,
};

describe('demo environment parsing', () => {
    it('validates OpenAI env and resolves base URL from env only', () => {
        const env = parseDemoEnv({
            OPENAI_API_KEY: 'test-key',
            OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
            OPENAI_MODEL: 'openai/gpt-4.1-mini',
        });

        const options = resolveDemoOptions(cliOptions, env);

        expect(options.apiKey).toBe('test-key');
        expect(options.baseURL).toBe('https://openrouter.ai/api/v1');
        expect(options.model).toBe('openai/gpt-4.1-mini');
    });

    it('requires an OpenAI API key', () => {
        expect(() => parseDemoEnv({})).toThrow('OPENAI_API_KEY is required');
    });
});
