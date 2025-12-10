import { Command } from 'commander';
import OpenAI from 'openai';
import {Fetcher, LlmClient} from 'llm-fns';
import PQueue from 'p-queue';
import { ImageSearch } from './image-search/ImageSearch.js';
import { AiImageSearch } from '../utils/AiImageSearch.js';
import { WebSearch } from './web-search/WebSearch.js';
import { AiWebSearch } from '../utils/AiWebSearch.js';
import { PuppeteerHelper } from '../utils/puppeteer/PuppeteerHelper.js';
import { AiWebsiteAgent } from '../utils/AiWebsiteAgent.js';
import { OutputStrategy } from '../types.js';

export interface PluginServices {
    imageSearch?: ImageSearch;
    aiImageSearch?: AiImageSearch;
    webSearch?: WebSearch;
    aiWebSearch?: AiWebSearch;
    fetcher: Fetcher;
    puppeteerHelper?: PuppeteerHelper;
    aiWebsiteAgent?: AiWebsiteAgent;
    puppeteerQueue?: PQueue;
}

export interface PluginContext {
    row: Record<string, any>; // This is now the "View Context" (merged data)
    stepIndex: number;
    config: any; // The resolved plugin config
    output: OutputStrategy; // The output strategy for this plugin (e.g. explode)
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

export interface PluginResult {
    contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];

    /**
     * The data produced by the plugin.
     * - Return `[]` to filter (drop) the row.
     * - Return `[item]` to enrich the row (1:1).
     * - Return `[item1, item2, ...]` to explode the row (1:N).
     */
    data?: any[];
}

export interface NormalizedPluginConfig {
    config: any;
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
    normalize(options: Record<string, any>, stepIndex: number, globalConfig: any): NormalizedPluginConfig | undefined;

    /**
     * Resolve templates, load files, and prepare the configuration for execution.
     * The returned config should be fully resolved (no Handlebars, no file paths).
     */
    prepare(config: any, row: Record<string, any>): Promise<any>;

    /**
     * Execute the plugin logic using the prepared configuration.
     * Returns content parts to be added to the user prompt and optional structured data.
     */
    execute(context: PluginContext): Promise<PluginResult>;
}
