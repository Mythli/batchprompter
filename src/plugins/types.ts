import { Command } from 'commander';
import OpenAI from 'openai';
import { LlmClient } from 'llm-fns';
import { ImageSearch } from './image-search/ImageSearch.js';
import { AiImageSearch } from '../utils/AiImageSearch.js';
import { Fetcher } from '../utils/createCachedFetcher.js';

export interface PluginServices {
    imageSearch?: ImageSearch;
    aiImageSearch?: AiImageSearch;
    fetcher: Fetcher;
}

export interface PluginContext {
    row: Record<string, any>;
    stepIndex: number;
    config: any; // The resolved plugin config
    llm: LlmClient;
    globalConfig: {
        tmpDir: string;
        concurrency: number;
    };
    services: PluginServices;
    
    // --- NEW: Explicit Paths ---
    outputDirectory?: string; // Where final assets go
    tempDirectory: string;    // Where intermediate assets (sprites) go

    // NEW: Filename components
    outputBasename?: string;
    outputExtension?: string;
}

export interface ContentProviderPlugin {
    name: string;

    /**
     * Register global CLI flags for this plugin.
     */
    register(program: Command): void;

    /**
     * Register step-specific CLI flags for this plugin.
     */
    registerStep(program: Command, stepIndex: number): void;

    /**
     * Parse and validate CLI options to produce a raw configuration.
     * Returns undefined if the plugin is not active for this step.
     */
    normalize(options: Record<string, any>, stepIndex: number, globalConfig: any): any | undefined;

    /**
     * Resolve templates, load files, and prepare the configuration for execution.
     * The returned config should be fully resolved (no Handlebars, no file paths).
     */
    prepare(config: any, row: Record<string, any>): Promise<any>;

    /**
     * Execute the plugin logic using the prepared configuration.
     * Returns content parts to be added to the user prompt.
     */
    execute(context: PluginContext): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]>;
}
