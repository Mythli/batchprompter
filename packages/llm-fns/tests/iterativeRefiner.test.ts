import { describe, it, expect, vi } from 'vitest';
import { createIterativeRefiner, IterationHistory } from '../src/IterativeRefiner.js';

describe('createIterativeRefiner', () => {
    it('should succeed on the first try if evaluation passes', async () => {
        const generate = vi.fn().mockResolvedValue({ value: 10 });
        const execute = vi.fn().mockResolvedValue(20);
        const evaluate = vi.fn().mockResolvedValue({ success: true });

        const refiner = createIterativeRefiner({
            generate,
            execute,
            evaluate,
            maxRetries: 3
        });

        const result = await refiner.run("input");

        expect(result.iterations).toBe(1);
        expect(result.config).toEqual({ value: 10 });
        expect(result.output).toBe(20);
        expect(result.history).toEqual([]);
        expect(generate).toHaveBeenCalledTimes(1);
        expect(execute).toHaveBeenCalledTimes(1);
        expect(evaluate).toHaveBeenCalledTimes(1);
    });

    it('should retry with feedback when evaluation fails', async () => {
        const generate = vi.fn()
            .mockResolvedValueOnce({ value: 10 }) // First attempt
            .mockResolvedValueOnce({ value: 15 }); // Second attempt

        const execute = vi.fn()
            .mockResolvedValueOnce(20)
            .mockResolvedValueOnce(30);

        const evaluate = vi.fn()
            .mockResolvedValueOnce({ success: false, feedback: "Too low" })
            .mockResolvedValueOnce({ success: true });

        const refiner = createIterativeRefiner({
            generate,
            execute,
            evaluate,
            maxRetries: 3
        });

        const result = await refiner.run("input");

        expect(result.iterations).toBe(2);
        expect(result.config).toEqual({ value: 15 });
        expect(result.output).toBe(30);
        expect(result.history).toHaveLength(1);
        expect(result.history[0]).toEqual({
            config: { value: 10 },
            feedback: "Too low"
        });

        expect(generate).toHaveBeenCalledTimes(2);
        // Check history passed to second generation
        const historyArg = generate.mock.calls[1][1] as IterationHistory<any>[];
        expect(historyArg).toHaveLength(1);
        expect(historyArg[0].feedback).toBe("Too low");
        expect(historyArg[0].config).toEqual({ value: 10 });
    });

    it('should handle generation errors and retry', async () => {
        const generate = vi.fn()
            .mockRejectedValueOnce(new Error("Gen Error"))
            .mockResolvedValueOnce({ value: 10 });

        const execute = vi.fn().mockResolvedValue(20);
        const evaluate = vi.fn().mockResolvedValue({ success: true });

        const refiner = createIterativeRefiner({
            generate,
            execute,
            evaluate,
            maxRetries: 3
        });

        const result = await refiner.run("input");

        expect(result.iterations).toBe(2); // 1 failed gen + 1 success
        expect(result.history).toHaveLength(1);
        expect(result.history[0].error).toBe("Gen Error");

        expect(generate).toHaveBeenCalledTimes(2);
        
        const historyArg = generate.mock.calls[1][1] as IterationHistory<any>[];
        expect(historyArg[0].error).toBe("Gen Error");
    });

    it('should handle execution errors and retry without feedback', async () => {
        const generate = vi.fn().mockResolvedValue({ value: 10 });
        
        const execute = vi.fn()
            .mockRejectedValueOnce(new Error("Exec Error"))
            .mockResolvedValueOnce(20);

        const evaluate = vi.fn().mockResolvedValue({ success: true });

        const refiner = createIterativeRefiner({
            generate,
            execute,
            evaluate,
            maxRetries: 3
        });

        const result = await refiner.run("input");

        expect(result.iterations).toBe(2);
        expect(execute).toHaveBeenCalledTimes(2);
        
        const historyArg = generate.mock.calls[1][1] as IterationHistory<any>[];
        expect(historyArg[0].error).toBe("Exec Error");
        expect(historyArg[0].feedback).toBeUndefined();
    });

    it('should return last result when max retries exhausted', async () => {
        const generate = vi.fn().mockResolvedValue({ value: 10 });
        const execute = vi.fn().mockResolvedValue(20);
        const evaluate = vi.fn().mockResolvedValue({ success: false, feedback: "Fail" });

        const refiner = createIterativeRefiner({
            generate,
            execute,
            evaluate,
            maxRetries: 2
        });

        const result = await refiner.run("input");

        expect(result.iterations).toBe(2);
        expect(evaluate).toHaveBeenCalledTimes(2);
        expect(result.config).toEqual({ value: 10 });
        expect(result.history).toHaveLength(2);
        expect(result.history[1].feedback).toBe("Fail");
    });
});
