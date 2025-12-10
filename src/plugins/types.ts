import { Command } from 'commander';
import OpenAI from 'openai';
import { OutputStrategy, StepContext, ServiceCapabilities } from '../types.js';
import { PuppeteerHelper } from '../utils/puppeteer/PuppeteerHelper.js';
import { Fetcher } from 'llm-fns';
import PQueue from 'p-queue';

// Legacy PluginServices interface for preprocessors
export interface PluginServices {
    puppeteerHelper?: PuppeteerHelper;
    fetcher: Fetcher;
    puppeteerQueue?: PQueue;
}

export interface PluginContext {
    row: Record<string, any>;
    stepIndex: number;
    config: any;
    output: OutputStrategy;
    
    // Dependency Injection
    stepContext: StepContext;

    // Explicit Paths
    outputDirectory?: string;
    tempDirectory: string;
    outputBasename?: string;
    outputExtension?: string;
}

export interface PluginResult {
    contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    data?: any[];
}

export interface NormalizedPluginConfig {
    config: any;
}

export interface ContentProviderPlugin {
    name: string;

    register(program: Command): void;
    registerStep(program: Command, stepIndex: number): void;

    /**
     * Parse and validate CLI options to produce a raw configuration.
     * Returns undefined if the plugin is not active for this step.
     * 
     * @param capabilities - Service capabilities for validation. Throw if required service is missing.
     */
    normalize(
        options: Record<string, any>, 
        stepIndex: number, 
        globalConfig: any,
        capabilities: ServiceCapabilities
    ): NormalizedPluginConfig | undefined;

    prepare(config: any, row: Record<string, any>): Promise<any>;
    execute(context: PluginContext): Promise<PluginResult>;
}
