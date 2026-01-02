import { z } from 'zod';
import { LlmClient } from '../BoundLlmClient.js';

export interface RefinerOptions {
    maxRetries: number;
}

export interface EvaluationResult {
    success: boolean;
    feedback?: string;
}

export abstract class IterativeRefiner<TInput, TConfig, TOutput> {
    constructor(protected options: RefinerOptions) {}

    protected abstract generate(input: TInput, feedback?: string, previousConfig?: TConfig): Promise<TConfig>;
    protected abstract execute(config: TConfig, input: TInput): Promise<TOutput>;
    protected abstract evaluate(input: TInput, config: TConfig, output: TOutput): Promise<EvaluationResult>;

    async run(input: TInput): Promise<{ config: TConfig; output?: TOutput; iterations: number }> {
        let currentConfig: TConfig | undefined;
        let currentFeedback: string | undefined;
        let lastOutput: TOutput | undefined;

        for (let i = 0; i < this.options.maxRetries; i++) {
            console.log(`[IterativeRefiner] Iteration ${i + 1}/${this.options.maxRetries}`);
            
            // 1. Generate
            try {
                currentConfig = await this.generate(input, currentFeedback, currentConfig);
            } catch (e: any) {
                console.error(`[IterativeRefiner] Generation failed: ${e.message}`);
                // If generation fails, we might want to retry with a generic error feedback or stop
                currentFeedback = `Previous generation failed with error: ${e.message}. Please fix the configuration structure.`;
                continue;
            }

            // 2. Execute
            try {
                lastOutput = await this.execute(currentConfig, input);
            } catch (e: any) {
                console.error(`[IterativeRefiner] Execution failed: ${e.message}`);
                // Execution errors are valid feedback for the LLM
                currentFeedback = `The configuration caused an execution error: ${e.message}. Please fix the configuration to avoid this error.`;
                
                // We still evaluate if we want the LLM to see the error specifically, 
                // but usually we can just loop back with the error message.
                // Let's try to evaluate to see if the LLM has specific insight, 
                // or just loop back. For now, loop back.
                continue;
            }

            // 3. Evaluate
            const evaluation = await this.evaluate(input, currentConfig, lastOutput);

            if (evaluation.success) {
                console.log(`[IterativeRefiner] Success on iteration ${i + 1}`);
                return { config: currentConfig, output: lastOutput, iterations: i + 1 };
            }

            console.log(`[IterativeRefiner] Feedback: ${evaluation.feedback}`);
            currentFeedback = evaluation.feedback;
        }

        if (!currentConfig) {
            throw new Error("Failed to generate any valid configuration.");
        }

        console.warn(`[IterativeRefiner] Max retries reached. Returning last result.`);
        return { config: currentConfig, output: lastOutput, iterations: this.options.maxRetries };
    }
}
