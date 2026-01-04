import { LlmClientFactory } from './LlmClientFactory.js';
import { GlobalContext, StepConfig, StepContext, ResolvedModelConfig, PipelineItem } from '../../types.js';
import { BoundLlmClient } from './BoundLlmClient.js';
export interface ResolvedStepContext {
    resolvedStep: StepConfig;
    stepContext: StepContext;
    viewContext: Record<string, any>;
    sanitizedRow: Record<string, any>;
}
export declare class StepResolver {
    private llmFactory;
    private globalContext;
    constructor(llmFactory: LlmClientFactory, globalContext: GlobalContext);
    resolve(item: PipelineItem, stepConfig: StepConfig, stepIndex: number, globalTmpDir: string): Promise<ResolvedStepContext>;
    createLlm(config: ResolvedModelConfig): BoundLlmClient;
}
//# sourceMappingURL=StepResolver.d.ts.map