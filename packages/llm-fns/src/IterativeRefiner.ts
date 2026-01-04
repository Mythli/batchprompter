export interface EvaluationResult {
    success: boolean;
    feedback?: string;
}

export interface IterationHistory<TGenerated> {
    generated?: TGenerated;
    feedback?: string;
    error?: string;
}

export interface CreateIterativeRefinerParams<TInput, TGenerated, TOutput> {
    /**
     * Function to generate the artifact.
     * Receives the input and the history of previous attempts.
     */
    generate: (input: TInput, history: IterationHistory<TGenerated>[]) => Promise<TGenerated>;

    /**
     * Function to execute the generated artifact.
     * Receives the generated artifact and the original input.
     */
    execute: (generated: TGenerated, input: TInput) => Promise<TOutput>;

    /**
     * Function to evaluate the output.
     * Returns success status and optional feedback.
     */
    evaluate: (input: TInput, generated: TGenerated, output: TOutput) => Promise<EvaluationResult>;

    /**
     * Maximum number of retries. Defaults to 3.
     */
    maxRetries?: number;
}

export function createIterativeRefiner<TInput, TGenerated, TOutput>(
    params: CreateIterativeRefinerParams<TInput, TGenerated, TOutput>
) {
    const { generate, execute, evaluate, maxRetries = 3 } = params;

    async function run(input: TInput): Promise<{ generated: TGenerated; output?: TOutput; iterations: number; history: IterationHistory<TGenerated>[] }> {
        const history: IterationHistory<TGenerated>[] = [];
        let currentGenerated: TGenerated | undefined;
        let lastOutput: TOutput | undefined;

        for (let i = 0; i < maxRetries; i++) {
            // 1. Generate
            currentGenerated = await generate(input, history);
            
            // 2. Execute
            lastOutput = await execute(currentGenerated, input);

            // 3. Evaluate
            const evaluation = await evaluate(input, currentGenerated, lastOutput);

            if (evaluation.success) {
                return { generated: currentGenerated, output: lastOutput, iterations: i + 1, history };
            }

            history.push({
                generated: currentGenerated,
                feedback: evaluation.feedback
            });
        }

        if (!currentGenerated) {
            throw new Error("Failed to generate any valid result after all retries.");
        }

        console.warn(`[IterativeRefiner] Max retries reached. Returning last result.`);
        return { generated: currentGenerated, output: lastOutput, iterations: maxRetries, history };
    }

    return { run };
}

export type IterativeRefiner = ReturnType<typeof createIterativeRefiner>;
