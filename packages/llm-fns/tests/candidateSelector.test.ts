import { describe, it, expect, vi } from 'vitest';
import { createCandidateSelector } from '../src/createCandidateSelector.js';

describe('createCandidateSelector', () => {
    it('should generate N candidates and select the best one', async () => {
        const generate = vi.fn().mockImplementation(async (input, index) => {
            return `Candidate ${index}`;
        });

        const judge = vi.fn().mockResolvedValue({
            bestCandidateIndex: 1, // Select the second one (index 1)
            reason: "It is the best"
        });

        const selector = createCandidateSelector({
            candidateCount: 3,
            generate,
            judge
        });

        const result = await selector.run("input");

        expect(generate).toHaveBeenCalledTimes(3);
        expect(judge).toHaveBeenCalledTimes(1);
        
        // Check judge arguments
        const judgeArgs = judge.mock.calls[0];
        expect(judgeArgs[1]).toEqual(['Candidate 0', 'Candidate 1', 'Candidate 2']);

        expect(result.winner).toBe('Candidate 1');
        expect(result.winnerIndex).toBe(1);
        expect(result.reason).toBe("It is the best");
        expect(result.skippedJudge).toBe(false);
    });

    it('should skip judge if only one candidate succeeds', async () => {
        const generate = vi.fn().mockImplementation(async (input, index) => {
            if (index === 0) return "Survivor";
            throw new Error("Failed");
        });

        const judge = vi.fn();
        const onCandidateError = vi.fn();

        const selector = createCandidateSelector({
            candidateCount: 3,
            generate,
            judge,
            onCandidateError
        });

        const result = await selector.run("input");

        expect(generate).toHaveBeenCalledTimes(3);
        expect(onCandidateError).toHaveBeenCalledTimes(2);
        expect(judge).not.toHaveBeenCalled();

        expect(result.winner).toBe("Survivor");
        expect(result.winnerIndex).toBe(0);
        expect(result.skippedJudge).toBe(true);
    });

    it('should throw if all candidates fail', async () => {
        const generate = vi.fn().mockRejectedValue(new Error("Fail"));
        
        const selector = createCandidateSelector({
            candidateCount: 2,
            generate,
            judge: vi.fn()
        });

        await expect(selector.run("input")).rejects.toThrow("All 2 candidates failed");
    });

    it('should map judge index back to correct candidate when some fail', async () => {
        // Index 0 fails
        // Index 1 succeeds -> mapped index 0 for judge
        // Index 2 succeeds -> mapped index 1 for judge
        const generate = vi.fn().mockImplementation(async (input, index) => {
            if (index === 0) throw new Error("Fail");
            return `Candidate ${index}`;
        });

        const judge = vi.fn().mockResolvedValue({
            bestCandidateIndex: 1, // Selects the second passed candidate (which is originally Index 2)
            reason: "Selected the last one"
        });

        const selector = createCandidateSelector({
            candidateCount: 3,
            generate,
            judge
        });

        const result = await selector.run("input");

        // Judge should see ['Candidate 1', 'Candidate 2']
        expect(judge.mock.calls[0][1]).toEqual(['Candidate 1', 'Candidate 2']);

        // Judge selected index 1 (Candidate 2)
        expect(result.winner).toBe('Candidate 2');
        expect(result.winnerIndex).toBe(2); // Original index preserved
    });
});
