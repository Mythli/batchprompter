import { describe, it, expect } from 'vitest';
import { setupTestEnvironment } from '../utils/testHelpers.js';
import { UrlExpanderPlugin } from '../../src/plugins/url-expander/UrlExpanderPlugin.js';
import { UrlHandlerRegistry } from '../../src/plugins/url-expander/utils/UrlHandlerRegistry.js';
import { GenericHandler } from '../../src/plugins/url-expander/utils/types.js';

// 1. Define Mock Handler
class MockPuppeteerHandler implements GenericHandler {
    name = 'mock-puppeteer';
    async handle(url: string) {
        return `<html><body><h1>Content for ${url}</h1><p>This is mocked.</p></body></html>`;
    }
}

describe('UrlExpanderPlugin', () => {
    it('should use the fallback handler to expand URLs in prompts', async () => {
        // 2. Wiring Dependencies
        // We pass the mock as the puppeteerFallback (2nd arg)
        const registry = new UrlHandlerRegistry(
            {} as any, // fetchFallback (unused in this test)
            new MockPuppeteerHandler() as any // puppeteerFallback
        );
        const plugin = new UrlExpanderPlugin(registry);

        // 3. Setup Env with Custom Plugin
        const { executor, openai } = setupTestEnvironment({
            plugins: [plugin]
        });

        // 4. Execute Config
        const config = {
            steps: [{
                prompt: "Read this: https://example.com/article",
                plugins: [{ type: 'url-expander' }] // Activates our injected plugin
            }]
        };

        await executor.runConfig(config, [{}]);

        // 5. Assertions
        const createCall = (openai.chat.completions.create as any);
        expect(createCall).toHaveBeenCalled();
        
        const callArgs = createCall.mock.calls[0][0];
        const messages = callArgs.messages;
        const lastMessage = messages[messages.length - 1];
        const contentParts = lastMessage.content;
        
        // Join all text parts to search easily
        const fullText = Array.isArray(contentParts) 
            ? contentParts.map((p: any) => p.text).join('') 
            : contentParts;

        // Check that the URL was found and expanded content was injected
        expect(fullText).toContain('Read this: https://example.com/article');
        expect(fullText).toContain('--- Content of https://example.com/article ---');
        
        // Check for Markdown conversion (h1 -> #)
        // Turndown converts <h1> to # 
        expect(fullText).toContain('Content for https://example.com/article');
        expect(fullText).toContain('This is mocked.');
    });
});
