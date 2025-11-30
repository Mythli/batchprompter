import OpenAI from 'openai';
import { LlmClient } from 'llm-fns';
import { ResolvedStepConfig } from './StepConfigurator.js';
import { StandardStrategy } from './strategies/StandardStrategy.js';
import { CandidateStrategy } from './strategies/CandidateStrategy.js';
import { ImageSearchStrategy } from './strategies/ImageSearchStrategy.js';
import { AiImageSearch } from './utils/AiImageSearch.js';

export class StepExecutor {
    constructor(
        private llm: LlmClient,
        private model: string | undefined,
        private aiImageSearch?: AiImageSearch
    ) {}

    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: ResolvedStepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    ): Promise<{ role: 'assistant', content: string }> {
        
        let strategy;

        // Determine Strategy
        if (config.imageSearchQuery || config.imageSearchPrompt) {
            if (!this.aiImageSearch) {
                throw new Error("Image Search requested but not configured (missing API Key).");
            }
            strategy = new ImageSearchStrategy(this.aiImageSearch, this.llm);
        } else {
            strategy = new StandardStrategy(this.llm, this.model);
        }
        
        // Wrap in Candidate Strategy if needed
        // Note: ImageSearchStrategy can also be wrapped in CandidateStrategy if we want multiple distinct search attempts!
        if (config.candidates > 1) {
            strategy = new CandidateStrategy(strategy, this.llm);
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
