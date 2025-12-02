// 
import OpenAI from 'openai';
import { LlmClient } from 'llm-fns';
import { StepConfig } from './types.js';
import { StandardStrategy } from './strategies/StandardStrategy.js';
import { CandidateStrategy } from './strategies/CandidateStrategy.js';
import { PluginRegistry } from './plugins/PluginRegistry.js';
import { PluginServices } from './plugins/types.js';

export class StepExecutor {
    
    constructor(
        private llm: LlmClient,
        private tmpDir: string,
        private concurrency: number,
        private services: PluginServices,
        private pluginRegistry: PluginRegistry
    ) {}

    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: StepConfig,
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
        
        // 1. Execute Plugins (Content Providers)
        let effectiveUserPromptParts = [...config.userPromptParts];
        
        for (const [name, pluginConfig] of Object.entries(config.plugins)) {
            const plugin = this.pluginRegistry.get(name);
            if (plugin) {
                try {
                    const contentParts = await plugin.execute({
                        row,
                        stepIndex,
                        config: pluginConfig,
                        llm: this.llm,
                        globalConfig: {
                            tmpDir: this.tmpDir,
                            concurrency: this.concurrency
                        },
                        services: this.services
                    });
                    effectiveUserPromptParts = [...contentParts, ...effectiveUserPromptParts];
                } catch (e: any) {
                    console.error(`[Row ${index}] Step ${stepIndex} Plugin '${name}' failed:`, e.message);
                    throw e; // Fail the step if a plugin fails
                }
            }
        }

        // 2. Select Strategy
        let strategy = new StandardStrategy(this.llm, config.modelConfig.model);
        
        // Wrap in Candidate Strategy if needed
        if (config.candidates > 1) {
            strategy = new CandidateStrategy(strategy, this.llm);
        }

        // 3. Execute Strategy
        const result = await strategy.execute(
            row,
            index,
            stepIndex,
            config,
            effectiveUserPromptParts,
            history
        );

        if (config.outputColumn && result.columnValue) {
            row[config.outputColumn] = result.columnValue;
        }

        return result.historyMessage;
    }
}
