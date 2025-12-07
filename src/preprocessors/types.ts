import { Command } from 'commander';
import OpenAI from 'openai';
import { PluginServices } from '../plugins/types.js';

export interface PreprocessorContext {
    row: Record<string, any>;
    services: PluginServices;
    options: Record<string, any>; // CLI options
}

export interface PromptPreprocessorPlugin {
    name: string;
    register(program: Command): void;
    process(
        parts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        context: PreprocessorContext
    ): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]>;
}
