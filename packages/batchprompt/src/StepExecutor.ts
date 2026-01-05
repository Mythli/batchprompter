import OpenAI from 'openai';
import path from 'path';
import { StepConfig, StepContext } from './types.js';
import { StandardStrategy } from './strategies/StandardStrategy.js';
import { CandidateStrategy } from './strategies/CandidateStrategy.js';
import { GenerationStrategy } from './strategies/GenerationStrategy.js';
import { MessageBuilder } from './core/MessageBuilder.js';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from './core/events.js';
import { Plugin, PluginServices } from './plugins/types.js';
import { ResolvedPluginBase } from './config/types.js';

export interface StepExecutionResult {
    historyMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam;
    modelResult: any;
}

export class StepExecutor {

    constructor(
        private events: EventEmitter<BatchPromptEvents>,
        private messageBuilder: MessageBuilder
    ) {}

    async executeModel(
        stepContext: StepContext,
        viewContext: Record<string, any>,
        index: number,
        stepIndex: number,
        config: StepConfig,
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        pluginContentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        variationIndex?: number,
        plugins: { instance: Plugin; config: any; def: ResolvedPluginBase }[] = [],
        pluginServices?: PluginServices,
        tempDir?: string
    ): Promise<StepExecutionResult> {

        let effectiveUserPromptParts = pluginContentParts;

        // Note: With the new architecture, plugins are handled inside StandardStrategy.
        // However, if we have NO prompt and NO plugins that do anything, we might want to skip?
        // But StandardStrategy now handles plugins.
        
        // We pass plugins to StandardStrategy.
        
        if (!pluginServices || !tempDir) {
            throw new Error("Plugin services and tempDir are required for StepExecutor.");
        }

        let strategy: GenerationStrategy = new StandardStrategy(
            stepContext.llm,
            this.messageBuilder,
            this.events,
            plugins,
            pluginServices,
            tempDir
        );

        if (config.candidates > 1) {
            strategy = new CandidateStrategy(strategy as StandardStrategy, stepContext, this.events);
        }

        const result = await strategy.execute(
            viewContext,
            index,
            stepIndex,
            config,
            effectiveUserPromptParts,
            history,
            undefined, // cacheSalt
            undefined, // outputPathOverride
            false, // skipCommands
            variationIndex // Pass variation index for filename generation
        );

        return {
            historyMessage: result.historyMessage,
            modelResult: result.raw !== undefined ? result.raw : result.columnValue
        };
    }
}
