import { describe, it, expect } from 'vitest';
import { setupTestEnvironment } from '../utils/testUtils.js';

describe('E2E Validation Plugin', () => {
    it('should pass validation when data matches schema', async () => {
        const mockResponses = [
            JSON.stringify({ name: "Alice", age: 30 })
        ];

        const { executor } = setupTestEnvironment({
            mockResponses
        });

        const config = {
            steps: [
                {
                    model: {
                        model: "gpt-mock",
                        prompt: "Generate a user"
                    },
                    schema: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            age: { type: "number" }
                        },
                        required: ["name", "age"]
                    },
                    output: {
                        mode: "merge"
                    },
                    plugins: [
                        {
                            type: "validation",
                            schema: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    age: { type: "number", minimum: 0 }
                                },
                                required: ["name", "age"]
                            },
                            failMode: "error"
                        }
                    ]
                }
            ]
        };

        const { results } = await executor.runConfig(config, [{}]);

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe("Alice");
        expect(results[0].age).toBe(30);
    });

    it('should drop row when validation fails with failMode=drop', async () => {
        const mockResponses = [
            JSON.stringify({ name: "Alice", age: -5 }) // Invalid: age is negative
        ];

        const { executor } = setupTestEnvironment({
            mockResponses
        });

        const config = {
            steps: [
                {
                    model: {
                        model: "gpt-mock",
                        prompt: "Generate a user"
                    },
                    schema: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            age: { type: "number" }
                        }
                    },
                    output: {
                        mode: "merge"
                    },
                    plugins: [
                        {
                            type: "validation",
                            schema: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    age: { type: "number", minimum: 0 }
                                },
                                required: ["name", "age"]
                            },
                            failMode: "drop"
                        }
                    ]
                }
            ]
        };

        const { results } = await executor.runConfig(config, [{}]);

        // Row should be dropped
        expect(results).toHaveLength(0);
    });

    it('should throw error when validation fails with failMode=error', async () => {
        const mockResponses = [
            JSON.stringify({ name: "Alice" }) // Invalid: missing age
        ];

        const { executor } = setupTestEnvironment({
            mockResponses
        });

        const config = {
            steps: [
                {
                    model: {
                        model: "gpt-mock",
                        prompt: "Generate a user"
                    },
                    schema: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            age: { type: "number" }
                        }
                    },
                    output: {
                        mode: "merge"
                    },
                    plugins: [
                        {
                            type: "validation",
                            schema: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    age: { type: "number" }
                                },
                                required: ["name", "age"]
                            },
                            failMode: "error"
                        }
                    ]
                }
            ]
        };

        // Should complete but row will have error (errors are caught at row level)
        const { results } = await executor.runConfig(config, [{}]);
        
        // Row errored out, so no results
        expect(results).toHaveLength(0);
    });

    it('should continue with metadata when validation fails with failMode=continue', async () => {
        const mockResponses = [
            JSON.stringify({ name: "Alice" }) // Invalid: missing age
        ];

        const { executor } = setupTestEnvironment({
            mockResponses
        });

        const config = {
            steps: [
                {
                    model: {
                        model: "gpt-mock",
                        prompt: "Generate a user"
                    },
                    schema: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            age: { type: "number" }
                        }
                    },
                    output: {
                        mode: "merge"
                    },
                    plugins: [
                        {
                            type: "validation",
                            schema: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    age: { type: "number" }
                                },
                                required: ["name", "age"]
                            },
                            failMode: "continue"
                        }
                    ]
                }
            ]
        };

        const { results } = await executor.runConfig(config, [{}]);

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe("Alice");
        expect(results[0]._validationError).toBeDefined();
        expect(results[0]._validationError.valid).toBe(false);
    });
});
