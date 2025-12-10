import { GlobalContext, StepConfig, StepContext, ResolvedModelConfig } from '../types.js';
import { ConfiguredLlmClient } from './ConfiguredLlmClient.js';

export class DependencyFactory {
    static createStepContext(global: GlobalContext, stepConfig: StepConfig): StepContext {
        
        const createLlmClient = (config: ResolvedModelConfig) => {
            return new ConfiguredLlmClient(global.baseLlm, config);
        };

        const llm = createLlmClient(stepConfig.modelConfig);
        
        let judge: ConfiguredLlmClient | undefined;
        if (stepConfig.judge) {
            judge = createLlmClient(stepConfig.judge);
        }

        let feedback: ConfiguredLlmClient | undefined;
        if (stepConfig.feedback) {
            feedback = createLlmClient(stepConfig.feedback);
        }

        return {
            global,
            llm,
            judge,
            feedback,
            createLlmClient
        };
    }
}
