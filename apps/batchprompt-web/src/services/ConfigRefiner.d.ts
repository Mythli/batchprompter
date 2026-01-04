import { IterativeRefiner, EvaluationResult, IterationHistory, SafePipelineConfig, LlmClientFactory } from 'batchprompt';
import { ExecutionService } from './ExecutionService.js';
export interface ConfigRefinerInput {
    prompt: string;
    sampleRows: any[];
    partialConfig?: any;
}
export interface ConfigRefinerOutput {
    results: any[];
    error?: string;
}
export declare class ConfigRefiner extends IterativeRefiner<ConfigRefinerInput, SafePipelineConfig, ConfigRefinerOutput> {
    private llmFactory;
    private executionService;
    constructor(llmFactory: LlmClientFactory, executionService: ExecutionService, options: {
        maxRetries: number;
    });
    protected generate(input: ConfigRefinerInput, history: IterationHistory<SafePipelineConfig>[]): Promise<SafePipelineConfig>;
    protected execute(config: SafePipelineConfig, input: ConfigRefinerInput): Promise<ConfigRefinerOutput>;
    protected evaluate(input: ConfigRefinerInput, config: SafePipelineConfig, output: ConfigRefinerOutput): Promise<EvaluationResult>;
}
//# sourceMappingURL=ConfigRefiner.d.ts.map