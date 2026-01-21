import { describe, it, expect } from 'vitest';
import { setupTestEnvironment } from '../utils/testUtils.js';

describe('E2E Dedupe Plugin', () => {
    it('should drop duplicate rows based on key template', async () => {
        const mockResponses = [
            "Summary for Alice",
            "Summary for Bob",
            // Third call should not happen if dedupe works
        ];

        const { executor, openai } = setupTestEnvironment({
            mockResponses
        });

        const config = {
            steps: [
                {
                    plugins: [
                        {
                            type: "dedupe",
                            key: "{{name}}"
                        }
                    ]
                },
                {
                    model: {
                        model: "gpt-mock",
                        prompt: "Summarize {{name}}"
                    },
                    output: {
                        mode: "column",
                        column: "summary"
                    }
                }
            ]
        };

        // Input has duplicate "Alice"
        const initialRows = [
            { name: "Alice" },
            { name: "Bob" },
            { name: "Alice" } // Duplicate
        ];

        const { results } = await executor.runConfig(config, initialRows);

        // Should only have 2 results (duplicate Alice dropped)
        expect(results).toHaveLength(2);
        
        const names = results.map((r: any) => r.name);
        expect(names).toContain("Alice");
        expect(names).toContain("Bob");

        // LLM should only be called twice
        const createCall = (openai.chat.completions.create as any);
        expect(createCall).toHaveBeenCalledTimes(2);
    });

    it('should support complex key templates', async () => {
        const mockResponses = [
            "Result 1",
            "Result 2"
        ];

        const { executor } = setupTestEnvironment({
            mockResponses
        });

        const config = {
            steps: [
                {
                    plugins: [
                        {
                            type: "dedupe",
                            key: "{{domain}}-{{category}}"
                        }
                    ]
                },
                {
                    model: {
                        model: "gpt-mock",
                        prompt: "Process {{domain}}"
                    },
                    output: {
                        mode: "column",
                        column: "result"
                    }
                }
            ]
        };

        const initialRows = [
            { domain: "example.com", category: "tech" },
            { domain: "example.com", category: "news" }, // Different category, should keep
            { domain: "example.com", category: "tech" }, // Duplicate of first
            { domain: "other.com", category: "tech" } // Different domain, should keep
        ];

        const { results } = await executor.runConfig(config, initialRows);

        // Should have 3 results (one duplicate dropped)
        expect(results).toHaveLength(3);
    });

    it('should keep all rows when no duplicates exist', async () => {
        const mockResponses = [
            "Result A",
            "Result B",
            "Result C"
        ];

        const { executor, openai } = setupTestEnvironment({
            mockResponses
        });

        const config = {
            steps: [
                {
                    plugins: [
                        {
                            type: "dedupe",
                            key: "{{id}}"
                        }
                    ]
                },
                {
                    model: {
                        model: "gpt-mock",
                        prompt: "Process {{id}}"
                    },
                    output: {
                        mode: "column",
                        column: "result"
                    }
                }
            ]
        };

        const initialRows = [
            { id: 1 },
            { id: 2 },
            { id: 3 }
        ];

        const { results } = await executor.runConfig(config, initialRows);

        expect(results).toHaveLength(3);

        const createCall = (openai.chat.completions.create as any);
        expect(createCall).toHaveBeenCalledTimes(3);
    });
});
