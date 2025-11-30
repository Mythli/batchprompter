import OpenAI from 'openai';
import { LlmClient } from 'llm-fns';
import { ResolvedStepConfig } from './StepConfigurator.js';
import { StandardStrategy } from './strategies/StandardStrategy.js';
import { CandidateStrategy } from './strategies/CandidateStrategy.js';
import { AiImageSearch } from './utils/AiImageSearch.js';
import { ImageSearchTool } from './utils/ImageSearchTool.js';

export class StepExecutor {
    private imageSearchTool?: ImageSearchTool;

    constructor(
        private llm: LlmClient,
        private model: string | undefined,
        aiImageSearch?: AiImageSearch
    ) {
        if (aiImageSearch) {
            this.imageSearchTool = new ImageSearchTool(aiImageSearch, llm);
        }
    }

    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: ResolvedStepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
        
        // Always use StandardStrategy, but inject the ImageSearchTool
        let strategy = new StandardStrategy(this.llm, this.model, this.imageSearchTool);
        
        // Wrap in Candidate Strategy if needed
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
