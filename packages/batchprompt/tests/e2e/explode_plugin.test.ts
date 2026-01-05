import { describe, it, expect } from 'vitest';
import { setupTestEnvironment } from '../utils/testHelpers.js';
import { WebSearch } from '../../src/plugins/web-search/WebSearch.js';

// Mock WebSearch
class MockWebSearch extends WebSearch {
    constructor() {
        super('mock-key', null as any, null as any);
    }
    async search(query: string) {
        // Return 3 results
        return [
            { title: 'Result 1', link: 'http://1.com', snippet: 'Snippet 1', type: 'seo' as const },
            { title: 'Result 2', link: 'http://2.com', snippet: 'Snippet 2', type: 'seo' as const },
            { title: 'Result 3', link: 'http://3.com', snippet: 'Snippet 3', type: 'seo' as const }
        ];
    }
}

describe('E2E Plugin Explosion', () => {
    it('should explode plugin results into multiple rows and execute model for each', async () => {
        // Mocks
        const mockResponses = [
            // We expect 3 calls to the model, one for each search result
            "Summary for Result 1",
            "Summary for Result 2",
            "Summary for Result 3"
        ];

        const mockWebSearch = new MockWebSearch();
        const { executor, openai } = setupTestEnvironment({
            mockResponses,
            webSearch: mockWebSearch
        });

        const config = {
            globals: { model: "gpt-mock" },
            steps: [
                {
                    // Step 1: Search and Explode
                    plugins: [
                        {
                            type: "web-search",
                            query: "test query",
                            // Disable internal LLM steps of web-search to keep test simple
                            mode: "none", 
                            output: { 
                                mode: "merge", 
                                explode: true 
                            }
                        }
                    ],
                    // The prompt that runs for EACH exploded result
                    prompt: "Summarize this", 
                    output: {
                        mode: "column",
                        column: "summary"
                    }
                }
            ]
        };

        const { results } = await executor.runConfig(config, [{ id: 1 }]);

        // Assertions
        expect(results).toHaveLength(3);
        expect(results[0].summary).toBe("Summary for Result 1");
        expect(results[1].summary).toBe("Summary for Result 2");
        expect(results[2].summary).toBe("Summary for Result 3");

        // Verify LLM calls
        const createCall = (openai.chat.completions.create as any);
        expect(createCall).toHaveBeenCalledTimes(3);
        
        // Verify context of calls
        const call1 = createCall.mock.calls[0][0];
        expect(JSON.stringify(call1.messages)).toContain("Snippet 1");
        
        const call2 = createCall.mock.calls[1][0];
        expect(JSON.stringify(call2.messages)).toContain("Snippet 2");

        const call3 = createCall.mock.calls[2][0];
        expect(JSON.stringify(call3.messages)).toContain("Snippet 3");
    });
});
