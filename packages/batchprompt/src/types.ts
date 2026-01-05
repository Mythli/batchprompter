import OpenAI from 'openai';
import { Fetcher } from 'llm-fns';
import { PuppeteerHelper } from './utils/puppeteer/PuppeteerHelper.js';
import { ImageSearch } from './plugins/image-search/ImageSearch.js';
import { WebSearch } from './plugins/web-search/WebSearch.js';
import PQueue from 'p-queue';
import { Cache } from 'cache-manager';
import { BoundLlmClient } from './core/BoundLlmClient.js';
import type { GlobalsConfig, ResolvedModelConfig, ServiceCapabilities, OutputConfig } from './config/types.js';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from './core/events.js';
import { ContentResolver } from './core/io/ContentResolver.js';
import { StepExecutionContext, StepHandlers } from './plugins/types.js';

// Re-export types from plugins to ensure single source of truth
export { StepExecutionContext, StepHandlers };

// --- Definitions ---

export interface ModelDefinition {
    model?: string;
    temperature?: number;
    thinkingLevel?: 'low' | 'medium' | 'high';
    systemSource?: string;
    promptSource?: string;
}

// Reuse types from config
export type OutputStrategy = OutputConfig;
export type OutputMode = OutputConfig['mode'];

export interface PluginConfigDefinition {
    name: string;
    config: any;
    output: OutputStrategy;
}

export interface PreprocessorConfigDefinition {
    name: string;
    config: any;
}

export interface StepDefinition {
    stepIndex: number;
    modelConfig: ModelDefinition;

    outputPath?: string;
    outputTemplate?: string;
    output: OutputStrategy;

    schemaPath?: string;
    jsonSchema?: any;
    verifyCommand?: string;
    postProcessCommand?: string;

    candidates: number;
    noCandidateCommand: boolean;

    judge?: ModelDefinition;
    feedback?: ModelDefinition;
    feedbackLoops: number;

    aspectRatio?: string;
    plugins: PluginConfigDefinition[];
    preprocessors: PreprocessorConfigDefinition[];
    timeout: number;
}

export interface NormalizedConfig {
    global: GlobalsConfig;
    steps: StepDefinition[];
    data: {
        format: string;
        offset?: number;
        limit?: number;
        rows: Record<string, any>[];
    };
}

// --- Resolved Configuration ---

export interface StepConfig {
    modelConfig: ResolvedModelConfig;
    tmpDir: string;
    userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];

    outputPath?: string;
    outputTemplate?: string;
    output: OutputStrategy;

    schemaPath?: string;
    jsonSchema?: any;

    // Legacy command strings (kept for config loading, but Core uses handlers)
    verifyCommand?: string;
    postProcessCommand?: string;

    candidates: number;
    noCandidateCommand: boolean;

    judge?: ResolvedModelConfig;
    feedback?: ResolvedModelConfig;
    feedbackLoops: number;

    aspectRatio?: string;
    plugins: PluginConfigDefinition[];
    preprocessors: PreprocessorConfigDefinition[];

    resolvedOutputDir?: string;
    resolvedTempDir?: string;
    outputBasename?: string;
    outputExtension?: string;
    options?: Record<string, any>;
    timeout: number;

    // New: Handlers for logic injection
    handlers?: StepHandlers;
}

export interface RuntimeConfig {
    concurrency: number;
    taskConcurrency: number;
    tmpDir: string;
    dataOutputPath?: string;
    steps: StepConfig[];
    data: Record<string, any>[];
    options?: Record<string, any>;
    offset?: number;
    limit?: number;
}

export interface ModelConfig extends ModelDefinition {}

// --- Execution Architecture ---

export interface PipelineItem {
    row: Record<string, any>;
    workspace: Record<string, any>;
    stepHistory: Record<string, any>[];
    history: any[];
    originalIndex: number;
    variationIndex?: number;
    accumulatedContent: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

// --- Dependency Injection Contexts ---

export interface GlobalContext {
    openai: OpenAI;
    events: EventEmitter<BatchPromptEvents>;

    cache?: Cache;
    gptQueue: PQueue;
    serperQueue: PQueue;
    puppeteerQueue: PQueue;
    taskQueue: PQueue;

    puppeteerHelper: PuppeteerHelper;
    fetcher: Fetcher;

    imageSearch?: ImageSearch;
    webSearch?: WebSearch;

    capabilities: ServiceCapabilities;
    defaultModel: string;

    contentResolver: ContentResolver;
}

export interface StepContext {
    global: GlobalContext;
    llm: BoundLlmClient;
    judge?: BoundLlmClient;
    feedback?: BoundLlmClient;
    createLlm(config: ResolvedModelConfig): BoundLlmClient;
}

export interface PreprocessorServices {
    puppeteerHelper?: PuppeteerHelper;
    fetcher: Fetcher;
    puppeteerQueue?: PQueue;
}
