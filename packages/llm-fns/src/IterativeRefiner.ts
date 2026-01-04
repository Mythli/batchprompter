export interface EvaluationResult {
    success: boolean;
    feedback?: string;
}

export interface IterationHistory<TConfig> {
    config?: TConfig;
    feedback?: string;
    error?: string;
}

export interface CreateIterativeRefinerParams<TInput, TConfig, TOutput> {
    /**
     * Function to generate the configuration.
     * Receives the input and the history of previous attempts.
     */
    generate: (input: TInput, history: IterationHistory<TConfig>[]) => Promise<TConfig>;

    /**
     * Function to execute the configuration.
     * Receives the generated configuration and the original input.
     */
    execute: (config: TConfig, input: TInput) => Promise<TOutput>;

    /**
     * Function to evaluate the output.
     * Returns success status and optional feedback.
     */
    evaluate: (input: TInput, config: TConfig, output: TOutput) => Promise<EvaluationResult>;

    /**
     * Maximum number of retries. Defaults to 3.
     */
    maxRetries?: number;
}

export function createIterativeRefiner<TInput, TConfig, TOutput>(
    params: CreateIterativeRefinerParams<TInput, TConfig, TOutput>
) {
    const { generate, execute, evaluate, maxRetries = 3 } = params;

    async function run(input: TInput): Promise<{ config: TConfig; output?: TOutput; iterations: number; history: IterationHistory<TConfig>[] }> {
        const history: IterationHistory<TConfig>[] = [];
        let currentConfig: TConfig | undefined;
        let lastOutput: TOutput | undefined;

        for (let i = 0; i < maxRetries; i++) {
            // 1. Generate
            currentConfig = await generate(input, history);
            lastOutput = await execute(currentConfig, input);

            // 3. Evaluate
            const evaluation = await evaluate(input, currentConfig, lastOutput);

            if (evaluation.success) {
                return { config: currentConfig, output: lastOutput, iterations: i + 1, history };
            }

            history.push({
                config: currentConfig,
                feedback: evaluation.feedback
            });
        }

        if (!currentConfig) {
            throw new Error("Failed to generate any valid configuration after all retries.");
        }

        console.warn(`[IterativeRefiner] Max retries reached. Returning last result.`);
        return { config: currentConfig, output: lastOutput, iterations: maxRetries, history };
    }

    return { run };
}

export type IterativeRefiner = ReturnType<typeof createIterativeRefiner>;
