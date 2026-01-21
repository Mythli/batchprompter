import { describe, it, expect } from 'vitest';
import { setupTestEnvironment } from '../utils/testUtils.js';
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
    it('should explode plugin results and respect global limit', async () => {
        // Mocks
        // We expect 2 calls to the model (limited by global limit: 2)
        const mockResponses = [
            "Summary for Result 1",
            "Summary for Result 2"
        ];

        const mockWebSearch = new MockWebSearch();
        const { executor, openai } = setupTestEnvironment({
            mockResponses,
            webSearch: mockWebSearch
        });

        const config = {
            limit: 2, // Global limit - should cap explosion to 2 items
            steps: [
                {
                    // Step 1: Search and Explode (Pass-through, no model)
                    output: { 
                        mode: "merge", 
                        explode: true 
                    },
                    plugins: [
                        {
                            type: "web-search",
                            query: "test query",
                            mode: "none"
                        }
                    ]
                },
                {
                    // Step 2: Summarize (Runs for each exploded row)
                    model: {
                        model: "gpt-mock",
                        prompt: "Summarize this: {{snippet}}"
                    },
                    output: {
                        mode: "column",
                        column: "summary"
                    }
                }
            ]
        };

        const { results } = await executor.runConfig(config, [{ id: 1 }]);

        // Assertions - should be limited to 2 despite 3 results from search
        expect(results).toHaveLength(2);
        expect(results[0].summary).toBe("Summary for Result 1");
        expect(results[1].summary).toBe("Summary for Result 2");

        // Verify LLM calls - only 2 due to limit
        const createCall = (openai.chat.completions.create as any);
        expect(createCall).toHaveBeenCalledTimes(2);
        
        // Verify context of calls
        const call1 = createCall.mock.calls[0][0];
        expect(JSON.stringify(call1.messages)).toContain("Snippet 1");
        
        const call2 = createCall.mock.calls[1][0];
        expect(JSON.stringify(call2.messages)).toContain("Snippet 2");
    });
});
