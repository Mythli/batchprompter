import { describe, it, expect } from 'vitest';
import { setupTestEnvironment } from '../utils/testHelpers.js';
import { ValidationPluginV2 } from '../../src/plugins/validation/ValidationPluginV2.js';

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

        const { executor, contentResolver } = setupTestEnvironment({
            mockResponses: [step1Response, step2ResponseAlice, step2ResponseBob],
            plugins: [new ValidationPluginV2()]
        });

        // 2. Setup Dynamic Schema in Memory
        // We use a single schema file with Handlebars inside the content.
        // This tests that SchemaLoader correctly renders the content per-row.
        const schemaTemplate = JSON.stringify({
            type: "object",
            properties: {
                age: { type: "number" },
                city: { const: "{{name}}land" } // Dynamic constraint based on row data
            },
            required: ["age", "city"]
        });
        
        contentResolver.setFile('schema_dynamic.json', schemaTemplate);

        // 3. Config
        const config = {
            globals: {
                model: "gpt-mock"
            },
            steps: [
                {
                    // Step 1: Generate Array -> Explode
                    prompt: "Generate users",
                    jsonSchema: {
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
                    // Uses Validation Plugin to check Step 1 output (name exists)
                    plugins: [
                        {
                            type: "validation",
                            schema: {
                                type: "object",
                                properties: {
                                    name: { type: "string", minLength: 1 }
                                },
                                required: ["name"]
                            }
                        }
                    ],
                    prompt: "Details for {{name}}",
                    // Static path to dynamic content
                    schemaPath: "schema_dynamic.json", 
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
