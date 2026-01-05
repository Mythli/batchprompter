import { describe, it, expect } from 'vitest';
import { setupTestEnvironment } from '../utils/testHelpers.js';

describe('E2E JSON Explode and Merge', () => {
    it('should explode JSON output and merge subsequent step with dynamic schema validation', async () => {
        // 1. Mock Responses
        const step1Response = JSON.stringify([
            { name: "Alice" },
            { name: "Bob" }
        ]);

        const step2ResponseAlice = JSON.stringify({
            age: 25,
            city: "Aliceland"
        });

        const step2ResponseBob = JSON.stringify({
            age: 30,
            city: "Bobland"
        });

        // Use a resolver function to return the correct response based on the prompt content
        const mockResolver = (messages: any[]) => {
            const lastMsg = messages[messages.length - 1];
            const content = Array.isArray(lastMsg.content) 
                ? lastMsg.content.map((c: any) => c.text).join('') 
                : lastMsg.content;

            if (content.includes("Generate users")) {
                return step1Response;
            }
            if (content.includes("Details for Alice")) {
                return step2ResponseAlice;
            }
            if (content.includes("Details for Bob")) {
                return step2ResponseBob;
            }
            return "{}";
        };

        const { executor } = setupTestEnvironment({
            mockResponses: mockResolver
        });

        // 3. Config
        const config = {
            globals: {
                model: "gpt-mock"
            },
            steps: [
                {
                    // Step 1: Generate Array -> Explode
                    prompt: "Generate users",
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
                    // Uses schema directly on the step, no validation plugin
                    prompt: "Details for {{name}}",
                    // Inline dynamic schema (stringified JSON with Handlebars)
                    // This tests that StepResolver correctly renders the schema content per-row
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

        // 4. Run
        const { results } = await executor.runConfig(config, [{}]);

        // 5. Assertions
        expect(results).toHaveLength(2);

        const alice = results.find(r => r.name === "Alice");
        expect(alice).toBeDefined();
        expect(alice.age).toBe(25);
        expect(alice.city).toBe("Aliceland");

        const bob = results.find(r => r.name === "Bob");
        expect(bob).toBeDefined();
        expect(bob.age).toBe(30);
        expect(bob.city).toBe("Bobland");
    });
});
