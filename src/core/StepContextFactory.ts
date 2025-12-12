import { LlmClientFactory } from './LlmClientFactory.js';
import { GlobalContext, StepConfig, StepContext, ResolvedModelConfig } from '../types.js';
import { BoundLlmClient } from './BoundLlmClient.js';

export class StepContextFactory {
    constructor(
        private llmFactory: LlmClientFactory,
        private globalContext: GlobalContext
    ) {}

    create(stepConfig: StepConfig): StepContext {
        const mainLlm = this.llmFactory.create(stepConfig.modelConfig);
        
        let judgeLlm: BoundLlmClient | undefined = undefined;
        if (stepConfig.judge) {
            judgeLlm = this.llmFactory.create(stepConfig.judge);
        }

        let feedbackLlm: BoundLlmClient | undefined = undefined;
        if (stepConfig.feedback) {
            feedbackLlm = this.llmFactory.create(stepConfig.feedback);
        }

        const createLlm = (config: ResolvedModelConfig): BoundLlmClient => {
            return this.llmFactory.create(config);
        };

        return {
            global: this.globalContext,
            llm: mainLlm,
            judge: judgeLlm,
            feedback: feedbackLlm,
            createLlm
        };
    }
}
