import { describe, it, expect } from 'vitest';
import { setupTestEnvironment } from '../utils/testHelpers.js';

describe('E2E JSON Explode and Merge', () => {
    it('should explode JSON output and merge subsequent step with dynamic schema validation', async () => {
        // 1. Mock Responses
        // Step 1: Returns an array of users
        const step1Response = JSON.stringify([
            { name: "Alice" },
            { name: "Bob" }
        ]);

        // Step 2: Returns details for Alice
        const step2ResponseAlice = JSON.stringify({
            age: 25,
            city: "Aliceland"
        });

        // Step 2: Returns details for Bob
        const step2ResponseBob = JSON.stringify({
            age: 30,
            city: "Bobland"
        });

        const { executor } = setupTestEnvironment({
            mockResponses: [step1Response, step2ResponseAlice, step2ResponseBob]
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
                    prompt: "Details for {{name}}",
                    // Inline dynamic schema (stringified JSON with Handlebars)
                    // This tests that StepResolver correctly renders the schema content per-row
                    schema: JSON.stringify({
                        type: "object",
                        properties: {
                            age: { type: "number" },
                            city: { const: "{{name}}land" }
                        },
                        required: ["age", "city"]
                    }),
                    output: {
                        mode: "merge",
                        explode: false
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
