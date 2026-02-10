import { describe, it, expect, vi } from 'vitest';
import { setupTestEnvironment } from '../utils/testUtils.js';
import { PuppeteerHelper } from '../../src/utils/puppeteer/PuppeteerHelper.js';

// Mock Puppeteer Page Helper
const mockPageHelper = {
    navigateAndCache: vi.fn(async (url, action) => {
        // Mock page content based on URL
        const mockPages: Record<string, any> = {
            "http://example.com": {
                html: "<html><body><h1>Home</h1><a href='http://example.com/about'>About</a></body></html>",
                markdown: "# Home\n[About](http://example.com/about)",
                links: [{ href: "http://example.com/about", text: "About" }]
            },
            "http://example.com/about": {
                html: "<html><body><h1>About</h1><p>CEO is Alice</p></body></html>",
                markdown: "# About\nCEO is Alice",
                links: []
            }
        };

        const pageData = mockPages[url] || { html: "", markdown: "", links: [] };
        
        // Simulate the action callback which usually extracts content
        // We return the pre-canned data structure expected by AiWebsiteAgent
        return pageData;
    }),
    close: vi.fn()
};

// Mock Puppeteer Helper
const mockPuppeteerHelper = {
    getPageHelper: vi.fn(async () => mockPageHelper)
} as unknown as PuppeteerHelper;

describe('E2E Website Agent', () => {
    it('should navigate, extract, and merge data', async () => {
        // Mock LLM Responses
        // 1. Navigator (Home): Go to About
        const navResponse1 = JSON.stringify({
            next_urls: ["http://example.com/about"],
            reasoning: "Need to find CEO info",
            is_done: false
        });
        
        // 2. Extractor (Home): Found nothing
        const extResponse1 = JSON.stringify({});

        // 3. Navigator (About): Done
        const navResponse2 = JSON.stringify({
            next_urls: [],
            reasoning: "Found CEO info",
            is_done: true
        });

        // 4. Extractor (About): Found CEO
        const extResponse2 = JSON.stringify({
            ceo: "Alice"
        });

        // 5. Merger: Combine results
        const mergeResponse = JSON.stringify({
            ceo: "Alice"
        });

        // Resolver to dispatch mocks based on prompt content
        const mockResolver = (messages: any[]) => {
            const lastMsg = messages[messages.length - 1];
            const content = JSON.stringify(lastMsg.content);

            if (content.includes("Select up to")) {
                // Navigator
                if (content.includes("http://example.com/about")) {
                    // If about link is available, we are at Home or have visited Home
                    // Check visited list in status
                    if (content.includes("Pages Visited: 1")) {
                        return navResponse1;
                    }
                    return navResponse2; // Should not happen if logic is correct
                }
                // If we are at About (visited 2), return done
                if (content.includes("Pages Visited: 2")) {
                    return navResponse2;
                }
                return navResponse1;
            }

            if (content.includes("Website content")) {
                // Extractor
                if (content.includes("CEO is Alice")) {
                    return extResponse2;
                }
                return extResponse1;
            }

            if (content.includes("Objects to merge")) {
                return mergeResponse;
            }

            return "{}";
        };

        const { executor } = setupTestEnvironment({
            mockResponses: mockResolver,
            // Inject our mock puppeteer helper into the test environment
            // The setupTestEnvironment uses deps.puppeteerHelper if provided
        });
        
        // Override the puppeteer helper in the deps
        // We need to do this before runConfig because setupTestEnvironment creates the registry
        // But setupTestEnvironment creates deps internally.
        // Let's look at setupTestEnvironment implementation in testUtils.ts.
        // It accepts webSearch/imageSearch but not puppeteerHelper override directly in options,
        // but it uses createTestContext which creates a mock puppeteerHelper.
        // We need to override that mock.
        
        // Actually, setupTestEnvironment creates a fresh registry.
        // We can't easily inject the mock helper via options without modifying testUtils.
        // However, createTestContext creates a mock object for puppeteerHelper.
        // We can spy on that mock or modify testUtils.
        
        // Let's modify the test to use the default mock from testUtils and spy on it?
        // No, the default mock in testUtils.ts is:
        // puppeteerHelper: { getPageHelper: vi.fn(), close: vi.fn() }
        
        // We can access it via the returned deps.
    });
    
    // Re-implementing the test with proper injection
    it('should navigate, extract, and merge data (with injection)', async () => {
        const navResponse1 = JSON.stringify({ next_urls: ["http://example.com/about"], reasoning: "Go to About", is_done: false });
        const extResponse1 = JSON.stringify({});
        const navResponse2 = JSON.stringify({ next_urls: [], reasoning: "Done", is_done: true });
        const extResponse2 = JSON.stringify({ ceo: "Alice" });
        const mergeResponse = JSON.stringify({ ceo: "Alice" });

        const mockResolver = (messages: any[]) => {
            const content = JSON.stringify(messages);
            if (content.includes("Select up to")) {
                if (content.includes("Pages Visited: 1")) return navResponse1;
                return navResponse2;
            }
            if (content.includes("Website content")) {
                if (content.includes("CEO is Alice")) return extResponse2;
                return extResponse1;
            }
            if (content.includes("Objects to merge")) return mergeResponse;
            return "{}";
        };

        const { executor, deps } = setupTestEnvironment({
            mockResponses: mockResolver
        });

        // Override the mock implementation of the default puppeteer helper
        const getPageHelperSpy = deps.puppeteerHelper.getPageHelper as any;
        getPageHelperSpy.mockResolvedValue(mockPageHelper);

        const config = {
            steps: [
                {
                    plugins: [
                        {
                            type: "website-agent",
                            url: "http://example.com",
                            schema: {
                                type: "object",
                                properties: { ceo: { type: "string" } }
                            },
                            budget: 5,
                            output: { mode: "merge" }
                        }
                    ]
                }
            ]
        };

        const { results } = await executor.runConfig(config, [{}]);

        expect(results).toHaveLength(1);
        // Plugin output is namespaced under camelCased plugin type: 'websiteAgent'
        expect(results[0].websiteAgent.ceo).toBe("Alice");
        
        // Verify navigation flow
        expect(mockPageHelper.navigateAndCache).toHaveBeenCalledTimes(2);
        expect(mockPageHelper.navigateAndCache).toHaveBeenCalledWith("http://example.com", expect.any(Function), expect.any(Object));
        expect(mockPageHelper.navigateAndCache).toHaveBeenCalledWith("http://example.com/about", expect.any(Function), expect.any(Object));
    });
});
