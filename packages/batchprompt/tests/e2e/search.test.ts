import { describe, it, expect, vi } from 'vitest';
import OpenAI from 'openai';
import { initConfig } from '../../src/getConfig.js';
import { InMemoryConfigExecutor } from '../../src/generator/InMemoryConfigExecutor.js';
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
    const openai = {
        chat: {
            completions: {
                create: vi.fn()
            }
        }
    } as unknown as OpenAI;

    // Setup sequential mock responses
    mockResponses.forEach(resp => {
        (openai.chat.completions.create as any).mockResolvedValueOnce({
            choices: [{ message: { content: typeof resp === 'string' ? resp : JSON.stringify(resp) } }]
        });
    });

    const mockWebSearch = new MockWebSearch();
    const mockImageSearch = new MockImageSearch();

    const deps = await initConfig({
        openai, 
        webSearch: mockWebSearch,
        imageSearch: mockImageSearch
    });

    const executor = new InMemoryConfigExecutor(
        deps.actionRunner,
        deps.pluginRegistry,
        deps.globalContext.events,
        deps.globalContext.contentResolver
    );

    return { executor, openai, mockWebSearch, mockImageSearch };
}

// =============================================================================
// Tests
// =============================================================================

describe('E2E Search Plugins', () => {

    it('should execute Web Search with selection and enrichment', async () => {
        const mockResponses = [
            // 1. Query Generation
            { queries: ["tesla investor relations"] },
            // 2. Selection (Reduce)
            { selected_indices: [0], reasoning: "This is the official IR page." },
            // 3. Next Step (Final Generation)
            "The CEO of Tesla is Elon Musk."
        ];

        const { executor, openai } = await setupSearchTest(mockResponses);

        const config = {
            globals: { model: "gpt-mock" },
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
                    output: { mode: "merge" }
                },
                {
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
            { queries: ["tesla model s photo"] },
            // 2. Selection (Reduce)
            { selected_indices: [1], reasoning: "Model S is the requested product." },
            // 3. Next Step (Final Generation)
            "This is a red Tesla Model S."
        ];

        const { executor, openai } = await setupSearchTest(mockResponses);

        const config = {
            globals: { model: "gpt-mock" },
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
                    output: { mode: "merge" }
                },
                {
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

    it('should handle explosion in Web Search', async () => {
        const mockResponses = [
            // 1. Query Generation
            { queries: ["tesla news"] },
            // 2. Selection (Reduce) - Select 2 items
            { selected_indices: [0, 1], reasoning: "Both are relevant news." },
            // 3. Next Step (Branch 1)
            "News 1 summary",
            // 4. Next Step (Branch 2)
            "News 2 summary"
        ];

        const { executor, openai } = await setupSearchTest(mockResponses);

        const config = {
            globals: { model: "gpt-mock" },
            steps: [
                {
                    plugins: [
                        {
                            type: "web-search",
                            queryPrompt: "Generate queries",
                            selectPrompt: "Select 2 items",
                            limit: 2,
                            output: { mode: "merge", explode: true }
                        }
                    ]
                },
                {
                    prompt: "Summarize this result",
                    output: { mode: "column", column: "summary" }
                }
            ]
        };

        const { results } = await executor.runConfig(config, [{ topic: "Tesla" }]);

        // Verify explosion: 1 input row -> 2 output rows
        expect(results).toHaveLength(2);
        expect(results[0].summary).toBe("News 1 summary");
        expect(results[1].summary).toBe("News 2 summary");
    });
});
