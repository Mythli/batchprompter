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
        
        // 1. Execute Image Search (Global Context for this step)
        // We do this here so the results are available to:
        // a) The StandardStrategy (for generation)
        // b) The CandidateStrategy (for the Judge to see)
        let effectiveUserPromptParts = [...userPromptParts];
        let effectiveConfig = { ...config };

        const hasSearchRequest = config.imageSearchQuery || config.imageSearchPrompt;

        if (hasSearchRequest && this.imageSearchTool) {
            const searchResult = await this.imageSearchTool.execute(row, index, stepIndex, config);
            
            // Prepend search results to the user prompt
            effectiveUserPromptParts = [...searchResult.contentParts, ...userPromptParts];

            // Clear search config to prevent strategies from re-running it
            effectiveConfig.imageSearchQuery = null;
            effectiveConfig.imageSearchPrompt = undefined;
        }

        // 2. Select Strategy
        // Always use StandardStrategy as base
        let strategy = new StandardStrategy(this.llm, this.model, this.imageSearchTool);
        
        // Wrap in Candidate Strategy if needed
        if (config.candidates > 1) {
            strategy = new CandidateStrategy(strategy, this.llm);
        }

        // 3. Execute
        const result = await strategy.execute(
            row,
            index,
            stepIndex,
            effectiveConfig,
            effectiveUserPromptParts,
            history
        );

        if (config.outputColumn && result.columnValue) {
            row[config.outputColumn] = result.columnValue;
        }

        return result.historyMessage;
    }
}
