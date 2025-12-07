import { Command } from 'commander';
import OpenAI from 'openai';
import { PluginServices } from '../plugins/types.js';
import { PreprocessorConfigDefinition } from '../types.js';

export interface PreprocessorContext {
    row: Record<string, any>;
    services: PluginServices;
}

export interface PromptPreprocessorPlugin {
    name: string;
    register(program: Command): void;
    registerStep(program: Command, stepIndex: number): void;
    
    normalize(options: Record<string, any>, stepIndex: number, globalConfig: any): PreprocessorConfigDefinition | undefined;

    process(
        parts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        context: PreprocessorContext,
        config: any
    ): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]>;
}
