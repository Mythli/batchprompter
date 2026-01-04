import { describe, it, expect, vi } from 'vitest';
import { createIterativeRefiner } from '../src/createIterativeRefiner.js';

describe('createIterativeRefiner', () => {
    it('should succeed on the first try if evaluation passes', async () => {
        const generate = vi.fn().mockResolvedValue({ value: 10 });
        const evaluate = vi.fn().mockResolvedValue({ success: true });

        const refiner = createIterativeRefiner({
            generate,
            evaluate,
            maxRetries: 3
        });

        const result = await refiner.run("input");

        expect(result.iterations).toBe(1);
        expect(result.generated).toEqual({ value: 10 });
        expect(result.history).toEqual([]);
        expect(result.evaluations).toHaveLength(1);
        expect(result.evaluations[0]).toEqual({ success: true });
        expect(result.success).toBe(true);
        expect(generate).toHaveBeenCalledTimes(1);
        expect(evaluate).toHaveBeenCalledTimes(1);
    });

    it('should retry with feedback when evaluation fails', async () => {
        const generate = vi.fn()
            .mockResolvedValueOnce({ value: 10 }) // First attempt
            .mockResolvedValueOnce({ value: 15 }); // Second attempt

        const evaluate = vi.fn()
            .mockResolvedValueOnce({ success: false, feedback: "Too low" })
            .mockResolvedValueOnce({ success: true });

        const refiner = createIterativeRefiner({
            generate,
            evaluate,
            maxRetries: 3
        });

        const result = await refiner.run("input");

        expect(result.iterations).toBe(2);
        expect(result.generated).toEqual({ value: 15 });
        expect(result.success).toBe(true);

        // History should contain the failed attempt (Assistant) and feedback (User)
        expect(result.history).toHaveLength(2);
        expect(result.history[0]).toEqual({
            role: 'assistant',
            content: '{"value":10}'
        });
        expect(result.history[1]).toEqual({
            role: 'user',
            content: "Too low"
        });

        expect(result.evaluations).toHaveLength(2);
        expect(result.evaluations[0]).toEqual({ success: false, feedback: "Too low" });
        expect(result.evaluations[1]).toEqual({ success: true });

        expect(generate).toHaveBeenCalledTimes(2);

        // Check history passed to second generation
        const historyArg = generate.mock.calls[1][1] as any[];
        expect(historyArg).toHaveLength(2);
        expect(historyArg[0].role).toBe('assistant');
        expect(historyArg[1].role).toBe('user');
    });

    it('should use custom message converters', async () => {
        const generate = vi.fn()
            .mockResolvedValueOnce({ code: "bad" })
            .mockResolvedValueOnce({ code: "good" });

        const evaluate = vi.fn()
            .mockResolvedValueOnce({ success: false, feedback: "Syntax Error" })
            .mockResolvedValueOnce({ success: true });

        const refiner = createIterativeRefiner({
            generate,
            evaluate,
            maxRetries: 3,
            generatedToMessage: (g) => ({ role: 'assistant', content: `Code: ${g.code}` })
        });

        const result = await refiner.run("input");

        expect(result.history).toHaveLength(2);
        expect(result.history[0].content).toBe("Code: bad");
        expect(result.history[1].content).toBe("Syntax Error");
        expect(result.success).toBe(true);
    });

    it('should handle generation errors and retry', async () => {
        const generate = vi.fn()
            .mockRejectedValueOnce(new Error("Gen Error"))
            .mockResolvedValueOnce({ value: 10 });

        const evaluate = vi.fn().mockResolvedValue({ success: true });

        const refiner = createIterativeRefiner({
            generate,
            evaluate,
            maxRetries: 3
        });

        // Note: Since try/catches were removed from the implementation as requested,
        // this test expects the error to bubble up immediately rather than retry.
        await expect(refiner.run("input")).rejects.toThrow("Gen Error");
    });

    it('should return last result when max retries exhausted', async () => {
        const generate = vi.fn().mockResolvedValue({ value: 10 });
        const evaluate = vi.fn().mockResolvedValue({ success: false, feedback: "Fail" });

        const refiner = createIterativeRefiner({
            generate,
            evaluate,
            maxRetries: 2
        });

        const result = await refiner.run("input");

        expect(result.iterations).toBe(2);
        expect(evaluate).toHaveBeenCalledTimes(2);
        expect(result.generated).toEqual({ value: 10 });
        expect(result.success).toBe(false);
        expect(result.feedback).toBe("Fail");

        // History: Attempt 1 (Ass+User), Attempt 2 (Ass+User)
        expect(result.history).toHaveLength(4);
        expect(result.history[3].content).toBe("Fail");
        
        expect(result.evaluations).toHaveLength(2);
        expect(result.evaluations[1]).toEqual({ success: false, feedback: "Fail" });
    });
});
