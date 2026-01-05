import { describe, it, expect } from 'vitest';
import { setupTestEnvironment } from '../utils/testUtils.js';

describe('E2E Candidates with Judge', () => {
    it('should generate 3 candidates and use a judge to select the best one', async () => {
        // 1. Setup Mocks
        // We expect 3 generation calls (parallel) and 1 judge call (sequential after generation)
        const mockResponses = [
            "Option A: The Red Fox",   // Candidate 0
            "Option B: The Blue Dog",  // Candidate 1
            "Option C: The Green Cat", // Candidate 2
            // Judge Response (must match JudgeSchema: { best_candidate_index: number, reason: string })
            JSON.stringify({
                best_candidate_index: 1,
                reason: "Blue is a calming color."
            })
        ];

        const { executor, openai } = setupTestEnvironment({
            mockResponses
        });

        // 2. Define Config
        const config = {
            globals: {
                model: "gpt-mock"
            },
            steps: [
                {
                    prompt: "Generate a creative animal name",
                    candidates: 3,
                    judge: {
                        model: "gpt-judge",
                        prompt: "Select the most creative name."
                    },
                    output: {
                        mode: "column",
                        column: "bestName"
                    }
                }
            ]
        };

        const initialRows = [{ id: 1 }];

        // 3. Execute
        const { results } = await executor.runConfig(config, initialRows);

        // 4. Verify Results
        expect(results).toHaveLength(1);
        // The judge selected index 1 ("Option B: The Blue Dog")
        expect(results[0].bestName).toBe("Option B: The Blue Dog");

        // 5. Verify LLM Calls
        const createCall = (openai.chat.completions.create as any);
        // 3 candidates + 1 judge = 4 calls
        expect(createCall).toHaveBeenCalledTimes(4);

        // Verify the judge call (last one)
        const judgeCallArgs = createCall.mock.calls[3][0];
        const messages = judgeCallArgs.messages;
        
        // The judge prompt should contain the candidates
        // Messages structure: [System, User(Context), User(Candidates)] or similar depending on BoundLlmClient
        const fullContent = JSON.stringify(messages);
        expect(fullContent).toContain("Option A: The Red Fox");
        expect(fullContent).toContain("Option B: The Blue Dog");
        expect(fullContent).toContain("Option C: The Green Cat");
    });
});
