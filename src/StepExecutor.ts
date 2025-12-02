// @ts-nocheck
import OpenAI from 'openai';
import { LlmClient } from 'llm-fns';
import { StepConfig } from './types.js';
import { StandardStrategy } from './strategies/StandardStrategy.js';
import { CandidateStrategy } from './strategies/CandidateStrategy.js';
import { AiImageSearch } from './utils/AiImageSearch.js';
import { ImageSearchTool } from './utils/ImageSearchTool.js';
import { ImageSearchToolNotConfigured } from './utils/ImageSearchToolNotConfigured.js';
import { IImageSearchTool } from './utils/IImageSearchTool.js';
import { ModelRequestNormalizer } from './core/ModelRequestNormalizer.js';

export class StepExecutor {
    private imageSearchTool: IImageSearchTool;

    constructor(
        private llm: LlmClient,
        aiImageSearch?: AiImageSearch
    ) {
        if (aiImageSearch) {
            this.imageSearchTool = new ImageSearchTool(aiImageSearch, llm);
        } else {
            this.imageSearchTool = new ImageSearchToolNotConfigured();
        }
    }

    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: StepConfig,
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
        
        // 1. Execute Image Search (Global Context for this step)
        let effectiveUserPromptParts = [...config.userPromptParts];
        
        // We execute the tool unconditionally. 
        // If config.imageSearch is missing, the tool returns empty.
        // If config.imageSearch is present but tool is NotConfigured, it throws.
        const searchResult = await this.imageSearchTool.execute(row, index, stepIndex, config);
        
        // Prepend search results
        effectiveUserPromptParts = [...searchResult.contentParts, ...effectiveUserPromptParts];

        // 2. Select Strategy
        // StandardStrategy needs to know the model. 
        // In the new architecture, StandardStrategy should use ModelRequestNormalizer internally 
        // OR we pass the normalized request?
        // StandardStrategy currently takes (llm, model, tool).
        // We should update StandardStrategy to take the whole StepConfig or ModelConfig.
        
        // Let's instantiate StandardStrategy with the config's model for now, 
        // but really StandardStrategy needs to be updated to use Normalizer.
        
        let strategy = new StandardStrategy(this.llm, config.modelConfig.model);
        
        // Wrap in Candidate Strategy if needed
        if (config.candidates > 1) {
            strategy = new CandidateStrategy(strategy, this.llm);
        }

        // 3. Execute
        // The Strategy.execute signature needs to match.
        // It expects ResolvedStepConfig. Our StepConfig matches that interface mostly.
        
        const result = await strategy.execute(
            row,
            index,
            stepIndex,
            config, // StepConfig is compatible with ResolvedStepConfig (mostly)
            effectiveUserPromptParts,
            history
        );

        if (config.outputColumn && result.columnValue) {
            row[config.outputColumn] = result.columnValue;
        }

        return result.historyMessage;
    }
}
