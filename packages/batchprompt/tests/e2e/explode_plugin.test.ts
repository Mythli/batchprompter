import { describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';
import { setupTestEnvironment } from '../utils/testUtils.js';
import { WebSearch } from '../../src/plugins/web-search/WebSearch.js';

// Mock WebSearch
class MockWebSearch extends WebSearch {
    queries: string[] = [];

    constructor() {
        super('mock-key', null as any, null as any);
    }

    async search(query: string) {
        this.queries.push(query);
        // Return 3 results
        return [
            { title: 'Result 1', link: 'http://1.com', snippet: 'Snippet 1', type: 'seo' as const },
            { title: 'Result 2', link: 'http://2.com', snippet: 'Snippet 2', type: 'seo' as const },
            { title: 'Result 3', link: 'http://3.com', snippet: 'Snippet 3', type: 'seo' as const }
        ];
    }
}

function getLastUserText(call: any): string {
    const messages = call.messages;
    const lastMessage = messages[messages.length - 1];
    const content = lastMessage.content;
    return Array.isArray(content)
        ? content.map((part: any) => part.text ?? '').join('')
        : content;
}

describe('E2E Plugin Explosion', () => {
    it('should explode plugin results and respect global limit', async () => {
        const outputRoot = path.join(os.tmpdir(), 'batchprompt-explode-plugin-test');
        const mockResponses = (messages: any[]) => {
            const text = JSON.stringify(messages);
            if (text.includes('Snippet 1')) return "Summary for Result 1";
            if (text.includes('Snippet 2')) return "Summary for Result 2";
            return "Unexpected summary";
        };

        const mockWebSearch = new MockWebSearch();
        const { executor, openai } = setupTestEnvironment({
            mockResponses,
            webSearch: mockWebSearch
        });

        const config = {
            output: {
                limit: 2
            },
            steps: [
                {
                    plugins: [
                        {
                            type: "webSearch",
                            query: "test query {{_row_uid}} {{_row_index}}",
                            output: {
                                mode: "merge",
                                explode: true,
                            }
                        }
                    ]
                },
                {
                    // Step 2: Summarize (Runs for each exploded row)
                    model: {
                        model: "gpt-mock",
                        prompt: "Summarize this: {{snippet}} uid={{_row_uid}} index={{_row_index}}"
                    },
                    output: {
                        mode: "column",
                        column: "summary",
                        path: path.join(outputRoot, "{{_row_uid}}", "candidate.txt")
                    }
                }
            ]
        };

        const { results, artifacts } = await executor.runConfig(config, [{ id: 1 }]);

        // Assertions - should be limited to 2 despite 3 results from search
        expect(results).toHaveLength(2);
        expect(results.map(row => row.summary).sort()).toEqual([
            "Summary for Result 1",
            "Summary for Result 2"
        ]);
        expect(results.every(row => !('_row_uid' in row))).toBe(true);
        expect(results.every(row => !('_row_index' in row))).toBe(true);
        expect(mockWebSearch.queries).toEqual(["test query row-0-root 0"]);

        // Verify LLM calls - only 2 due to limit
        const createCall = (openai.chat.completions.create as any);
        expect(createCall).toHaveBeenCalledTimes(2);

        // Verify context of calls and branch-specific row ids
        const prompts = createCall.mock.calls.map((call: any[]) => getLastUserText(call[0]));
        expect(prompts).toEqual(expect.arrayContaining([
            expect.stringContaining("Snippet 1 uid=row-0-v0 index=0"),
            expect.stringContaining("Snippet 2 uid=row-0-v1 index=0")
        ]));

        const artifactPaths = artifacts.map((artifact: any) => artifact.path);
        expect(artifactPaths).toContain(path.join(outputRoot, "row-0-v0", "candidate.txt"));
        expect(artifactPaths).toContain(path.join(outputRoot, "row-0-v1", "candidate.txt"));
    });
});
