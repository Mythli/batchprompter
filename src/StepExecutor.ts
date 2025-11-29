import OpenAI from 'openai';
import { LlmClient } from 'llm-fns';
import { ResolvedStepConfig } from './StepConfigurator.js';
import { StandardStrategy } from './strategies/StandardStrategy.js';
import { CandidateStrategy } from './strategies/CandidateStrategy.js';

export class StepExecutor {
    constructor(
        private llm: LlmClient,
        private model: string | undefined
    ) {}

    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: ResolvedStepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    ): Promise<{ role: 'assistant', content: string }> {
        
        const standardStrategy = new StandardStrategy(this.llm, this.model);
        
        let strategy;
        if (config.candidates > 1) {
            strategy = new CandidateStrategy(standardStrategy, this.llm);
        } else {
            strategy = standardStrategy;
        }

        const result = await strategy.execute(
            row,
            index,
            stepIndex,
            config,
            userPromptParts,
            history
        );

        if (config.outputColumn && result.columnValue) {
            row[config.outputColumn] = result.columnValue;
        }

        return result.historyMessage;
    }
}
