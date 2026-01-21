import { describe, it, expect } from 'vitest';
import { setupTestEnvironment } from '../utils/testUtils.js';

describe('E2E JSON Explode and Merge', () => {
    it('should retry when the first response fails schema validation and limit explosion via global limit', async () => {
        // 1. Mock Responses
        // The first response is a single object, which will fail the 'array' type schema validation in StandardStrategy.
        const step1ResponseFail = JSON.stringify({
            name: "Invalid Single Object",
            reason: "This should trigger a retry because the schema expects an array"
        });

        // Return 3 items, but we will limit to 2 via globals
        const step1ResponseSuccess = JSON.stringify([
            { name: "Alice" },
            { name: "Bob" },
            { name: "Charlie" }
        ]);

        const step2ResponseAlice = JSON.stringify({
            age: 25,
            city: "Aliceland"
        });

        const step2ResponseBob = JSON.stringify({
            age: 30,
            city: "Bobland"
        });

        // Use a resolver function to return the correct response based on the prompt content and attempt count
        let step1CallCount = 0;
        const mockResolver = (messages: any[]) => {
            const lastMsg = messages[messages.length - 1];
            const content = (Array.isArray(lastMsg.content)
                ? lastMsg.content.map((c: any) => c.text).join('')
                : lastMsg.content) || "";

            if (content.includes("Generate users")) {
                step1CallCount++;
                return step1ResponseFail;
            }
            if (content.includes("must be array")) {
                step1CallCount++;
                return step1ResponseSuccess;
            }
            if (content.includes("Details for Alice")) {
                return step2ResponseAlice;
            }
            if (content.includes("Details for Bob")) {
                return step2ResponseBob;
            }
            // Charlie shouldn't be called if limit works
            if (content.includes("Details for Charlie")) {
                throw new Error("Should not request details for Charlie due to limit");
            }
            return "{}";
        };

        const { executor } = setupTestEnvironment({
            mockResponses: mockResolver
        });

        // 2. Config - model is now an object with model + prompt
        const config = {
            limit: 2, // Global limit to test explosion capping
            steps: [
                {
                    // Step 1: Generate Array -> Explode
                    model: {
                        model: "gpt-mock",
                        prompt: "Generate users"
                    },
                    schema: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: { name: { type: "string" } }
                        }
                    },
                    output: {
                        mode: "merge",
                        explode: true
                    }
                },
                {
                    // Step 2: Generate Details -> Merge
                    model: {
                        model: "gpt-mock",
                        prompt: "Details for {{name}}"
                    },
                    schema: {
                        type: "object",
                        properties: {
                            age: { type: "number" },
                            city: { const: "{{name}}land" }
                        },
                        required: ["age", "city"]
                    },
                    output: {
                        mode: "merge"
                    }
                }
            ]
        };

        // 3. Run
        const { results } = await executor.runConfig(config, [{}]);

        // 4. Assertions
        // We expect 2 results because the successful retry of Step 1 returned 3 items but limit was 2.
        expect(results).toHaveLength(2);
        expect(step1CallCount).toBe(2); // Verify that Step 1 was indeed called twice (initial + retry)

        const alice = results.find((r: any) => r.name === "Alice");
        expect(alice).toBeDefined();
        expect(alice.age).toBe(25);
        expect(alice.city).toBe("Aliceland");

        const bob = results.find((r: any) => r.name === "Bob");
        expect(bob).toBeDefined();
        expect(bob.age).toBe(30);
        expect(bob.city).toBe("Bobland");

        const charlie = results.find((r: any) => r.name === "Charlie");
        expect(charlie).toBeUndefined();
    });
});
