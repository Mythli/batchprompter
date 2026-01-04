export interface RefinerOptions {
    maxRetries: number;
}
export interface EvaluationResult {
    success: boolean;
    feedback?: string;
}
export interface IterationHistory<TConfig> {
    config?: TConfig;
    feedback?: string;
    error?: string;
}
export declare abstract class IterativeRefiner<TInput, TConfig, TOutput> {
    protected options: RefinerOptions;
    constructor(options: RefinerOptions);
    protected abstract generate(input: TInput, history: IterationHistory<TConfig>[]): Promise<TConfig>;
    protected abstract execute(config: TConfig, input: TInput): Promise<TOutput>;
    protected abstract evaluate(input: TInput, config: TConfig, output: TOutput): Promise<EvaluationResult>;
    run(input: TInput): Promise<{
        config: TConfig;
        output?: TOutput;
        iterations: number;
    }>;
}
//# sourceMappingURL=IterativeRefiner.d.ts.map