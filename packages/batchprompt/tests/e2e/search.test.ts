import { describe, it, expect } from 'vitest';
import { setupTestEnvironment } from '../utils/testUtils.js';
import { WebSearch } from '../../src/plugins/web-search/WebSearch.js';
import { ImageSearch } from '../../src/plugins/image-search/ImageSearch.js';

// =============================================================================
// Mocks
// =============================================================================

class MockWebSearch extends WebSearch {
    constructor() {
        super('mock-key', null as any, null as any);
    }
    async search(query: string) {
        if (query.includes('investor')) {
            return [{ 
                title: 'Tesla Investor Relations', 
                link: 'https://tesla.com/ir', 
                snippet: 'Official Tesla Investor Relations page with financial reports.', 
                type: 'seo' as const 
            }];
        }
        return [{ 
            title: 'Tesla Official Site', 
            link: 'https://tesla.com', 
            snippet: 'Electric Cars, Solar & Clean Energy', 
            type: 'seo' as const 
        }];
    }
    async fetchContent(url: string) {
        return `# Content for ${url}\nThis is the mock markdown content for the Tesla page.`;
    }
}

class MockImageSearch extends ImageSearch {
    constructor() {
        super('mock-key', null as any, null as any);
    }
    async search(query: string) {
        // Return a valid 1x1 red pixel PNG
        const buffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", 'base64');
        return [
            { 
                metadata: { 
                    title: 'Tesla Model S', 
                    imageUrl: 'https://example.com/s.jpg', 
                    imageWidth: 100, 
                    imageHeight: 100, 
                    position: 1 
                }, 
                buffer 
            },
            { 
                metadata: { 
                    title: 'Tesla Model 3', 
                    imageUrl: 'https://example.com/3.jpg', 
                    imageWidth: 100, 
                    imageHeight: 100, 
                    position: 2 
                }, 
                buffer 
            }
        ];
    }
}

async function setupSearchTest(mockResponses: any[]) {
    const mockWebSearch = new MockWebSearch();
    const mockImageSearch = new MockImageSearch();

    const { executor, openai } = setupTestEnvironment({
        mockResponses,
        webSearch: mockWebSearch,
        imageSearch: mockImageSearch
    });

    return { executor, openai, mockWebSearch, mockImageSearch };
}

// =============================================================================
// Tests
// =============================================================================

describe('E2E Search Plugins', () => {

    it('should execute Web Search with selection and enrichment', async () => {
        const mockResponses = [
            // 1. Query Generation
            JSON.stringify({ queries: ["tesla investor relations"] }),
            // 2. Selection (Reduce)
            JSON.stringify({ selected_indices: [0], reasoning: "This is the official IR page." }),
            // 3. Final Generation
            "The CEO of Tesla is Elon Musk."
        ];

        const { executor, openai } = await setupSearchTest(mockResponses);

        const config = {
            model: "gpt-mock",
            steps: [
                {
                    plugins: [
                        {
                            type: "web-search",
                            queryPrompt: "Generate queries for {{company}}",
                            selectPrompt: "Select the official investor relations page",
                            mode: "markdown",
                            limit: 1
                        }
                    ],
                    prompt: "Who is the CEO based on the search results?",
                    output: { mode: "column", column: "ceo" }
                }
            ]
        };

        const { results } = await executor.runConfig(config, [{ company: "Tesla" }]);

        expect(results).toHaveLength(1);
        expect(results[0].ceo).toBe("The CEO of Tesla is Elon Musk.");

        // Verify LLM calls
        const createCall = (openai.chat.completions.create as any);
        expect(createCall).toHaveBeenCalledTimes(3);

        // Verify that the final prompt contained the enriched content
        const finalCallArgs = createCall.mock.calls[2][0];
        const content = JSON.stringify(finalCallArgs.messages);
        expect(content).toContain("Content for https://tesla.com/ir");
        expect(content).toContain("mock markdown content");
    });

    it('should execute Image Search and pass base64 to next step', async () => {
        const mockResponses = [
            // 1. Query Generation
            JSON.stringify({ queries: ["tesla model s photo"] }),
            // 2. Selection (Reduce)
            JSON.stringify({ selected_indices: [1], reasoning: "Model S is the requested product." }),
            // 3. Final Generation
            "This is a red Tesla Model S."
        ];

        const { executor, openai } = await setupSearchTest(mockResponses);

        const config = {
            model: "gpt-mock",
            steps: [
                {
                    plugins: [
                        {
                            type: "image-search",
                            queryPrompt: "Generate queries for {{product}}",
                            selectPrompt: "Select the best image of {{product}}",
                            select: 1
                        }
                    ],
                    prompt: "Describe this image.",
                    output: { mode: "column", column: "description" }
                }
            ]
        };

        const { results, artifacts } = await executor.runConfig(config, [{ product: "Tesla Model S" }]);

        expect(results).toHaveLength(1);
        expect(results[0].description).toBe("This is a red Tesla Model S.");

        // Verify artifacts (sprite, candidate, selected)
        const artifactPaths = artifacts.map(a => a.path);
        expect(artifactPaths.some(p => p.includes('sprites'))).toBe(true);
        expect(artifactPaths.some(p => p.includes('selected'))).toBe(true);

        // Verify that the final prompt contained an image_url part
        const finalCallArgs = (openai.chat.completions.create as any).mock.calls[2][0];
        const lastMessage = finalCallArgs.messages[finalCallArgs.messages.length - 1];
        const imagePart = lastMessage.content.find((p: any) => p.type === 'image_url');
        
        expect(imagePart).toBeDefined();
        expect(imagePart.image_url.url).toContain('data:image/jpeg;base64,');
    });
});
