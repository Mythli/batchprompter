import OpenAI from 'openai';
import { StepConfig, StepContext } from './types.js';
import { StandardStrategy } from './strategies/StandardStrategy.js';
import { CandidateStrategy } from './strategies/CandidateStrategy.js';
import { GenerationStrategy, GenerationResult } from './strategies/GenerationStrategy.js';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from './core/events.js';
import { PluginServices } from './plugins/types.js';
import { ResolvedPlugin } from './core/PluginExecutor.js';

export interface StepExecutionResult {
    historyMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam;
    modelResult: any;
    explodedResults?: GenerationResult[];
}

export class StepExecutor {

    constructor(
        private events: EventEmitter<BatchPromptEvents>
    ) {}

    async executeModel(
        stepContext: StepContext,
        index: number,
        stepIndex: number,
        config: StepConfig,
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        variationIndex?: number,
        plugins: ResolvedPlugin[] = [],
        pluginServices?: PluginServices,
        tempDir?: string
    ): Promise<StepExecutionResult> {

        if (!pluginServices || !tempDir) {
            throw new Error("Plugin services and tempDir are required for StepExecutor.");
        }

        let strategy: GenerationStrategy = new StandardStrategy(
            stepContext.llm,
            this.events,
            plugins,
            pluginServices,
            tempDir
        );

        if (config.candidates > 1) {
            strategy = new CandidateStrategy(strategy as StandardStrategy, stepContext, this.events);
        }

        const result = await strategy.execute(
            {}, // Row is not needed here as messages are already built
            index,
            stepIndex,
            config,
            messages,
            undefined, // cacheSalt
            undefined, // outputPathOverride
            false, // skipCommands
            variationIndex // Pass variation index for filename generation
        );

        return {
            historyMessage: result.historyMessage,
            modelResult: result.raw !== undefined ? result.raw : result.columnValue,
            explodedResults: result.explodedResults
        };
    }
}
