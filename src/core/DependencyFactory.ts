import { GlobalContext, StepConfig, StepContext, LlmModelConfig } from '../types.js';
import { LlmClientFactory } from './LlmClientFactory.js';

/**
 * @deprecated Use StepContextFactory instead. This class is kept for backwards compatibility.
 */
export class DependencyFactory {
    static createStepContext(
        global: GlobalContext, 
        stepConfig: StepConfig,
        llmFactory: LlmClientFactory
    ): StepContext {
        
        const llm = llmFactory.createFromResolved(stepConfig.modelConfig);
        
        let judge = undefined;
        if (stepConfig.judge) {
            judge = llmFactory.createFromResolved(stepConfig.judge);
        }

        let feedback = undefined;
        if (stepConfig.feedback) {
            feedback = llmFactory.createFromResolved(stepConfig.feedback);
        }

        const createLlm = (config: LlmModelConfig) => {
            return llmFactory.create(config);
        };

        return {
            global,
            llm,
            judge,
            feedback,
            createLlm
        };
    }
}
