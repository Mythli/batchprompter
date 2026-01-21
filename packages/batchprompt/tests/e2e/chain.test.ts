import { describe, it, expect } from 'vitest';
import { setupTestEnvironment } from '../utils/testUtils.js';

describe('E2E Chain', () => {
    it('should execute a 2-step chain passing data', async () => {
        // 1. Setup Mocks
        const mockResponses = [
            "CyberPunk 2077", // Step 1 response
            "Wake the f*** up, Samurai" // Step 2 response
        ];
        
        const { executor, openai } = setupTestEnvironment({
            mockResponses
        });

        // 2. Define Config - model is now an object with model + prompt
        const config = {
            steps: [
                {
                    model: {
                        model: "gpt-mock",
                        prompt: "Generate a cool game name"
                    },
                    output: {
                        mode: "column",
                        column: "gameName"
                    }
                },
                {
                    model: {
                        model: "gpt-mock",
                        prompt: "Generate a slogan for {{gameName}}"
                    },
                    output: {
                        mode: "column",
                        column: "slogan"
                    }
                }
            ]
        };

        const initialRows = [{ id: 1 }];

        // 3. Execute
        const { results } = await executor.runConfig(config, initialRows);

        // 4. Verify Results
        expect(results).toHaveLength(1);
        expect(results[0].gameName).toBe("CyberPunk 2077");
        expect(results[0].slogan).toBe("Wake the f*** up, Samurai");

        // 5. Verify Chain Logic
        const createCall = (openai.chat.completions.create as any);
        expect(createCall).toHaveBeenCalledTimes(2);

        // Check that the second prompt contained the output of the first step
        const secondCallArgs = createCall.mock.calls[1][0];
        const messages = secondCallArgs.messages;
        const lastMessage = messages[messages.length - 1];
        
        // The content is usually an array of parts in this architecture
        const contentParts = lastMessage.content;
        const textContent = Array.isArray(contentParts) 
            ? contentParts.map((p: any) => p.text).join('') 
            : contentParts;

        expect(textContent).toContain("CyberPunk 2077");
    });
});
