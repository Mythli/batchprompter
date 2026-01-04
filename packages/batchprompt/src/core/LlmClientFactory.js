import { createLlm } from 'llm-fns';
import { BoundLlmClient } from './BoundLlmClient.js';
export class LlmClientFactory {
    openai;
    queue;
    defaultModel;
    constructor(openai, queue, defaultModel) {
        this.openai = openai;
        this.queue = queue;
        this.defaultModel = defaultModel;
    }
    /**
     * Creates a BoundLlmClient from a ResolvedModelConfig.
     * The returned client has the system and prompt parts bound.
     */
    create(config) {
        const modelConfig = {
            model: config.model || this.defaultModel
        };
        if (config.temperature !== undefined) {
            modelConfig.temperature = config.temperature;
        }
        if (config.thinkingLevel) {
            modelConfig.reasoning_effort = config.thinkingLevel;
        }
        const rawClient = createLlm({
            openai: this.openai,
            defaultModel: modelConfig,
            queue: this.queue,
        });
        return new BoundLlmClient(rawClient, config.systemParts || [], config.promptParts || []);
    }
}
//# sourceMappingURL=LlmClientFactory.js.map