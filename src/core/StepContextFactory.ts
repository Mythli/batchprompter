import { LlmClientFactory } from './LlmClientFactory.js';
import { GlobalContext, StepConfig, StepContext, LlmModelConfig } from '../types.js';

export class StepContextFactory {
    constructor(
        private llmFactory: LlmClientFactory,
        private globalContext: GlobalContext
    ) {}

    create(stepConfig: StepConfig): StepContext {
        // Create main LLM client
        const mainLlm = this.llmFactory.createFromResolved(stepConfig.modelConfig);
        
        // Create judge LLM client if configured
        let judgeLlm = undefined;
        if (stepConfig.judge) {
            judgeLlm = this.llmFactory.createFromResolved(stepConfig.judge);
        }

        // Create feedback LLM client if configured
        let feedbackLlm = undefined;
        if (stepConfig.feedback) {
            feedbackLlm = this.llmFactory.createFromResolved(stepConfig.feedback);
        }

        // Factory function for plugins to create ad-hoc clients
        const createLlm = (config: LlmModelConfig) => {
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
