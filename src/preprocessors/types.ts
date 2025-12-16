import { Command } from 'commander';
import OpenAI from 'openai';
import { PreprocessorConfigDefinition } from '../types.js';
import { PuppeteerHelper } from '../utils/puppeteer/PuppeteerHelper.js';
import { Fetcher } from 'llm-fns';
import PQueue from 'p-queue';

export interface PreprocessorServices {
    puppeteerHelper?: PuppeteerHelper;
    fetcher: Fetcher;
    puppeteerQueue?: PQueue;
}

export interface PreprocessorContext {
    row: Record<string, any>;
    services: PreprocessorServices;
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
