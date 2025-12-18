import OpenAI from 'openai';
import { Fetcher } from 'llm-fns';
import { PuppeteerHelper } from './utils/puppeteer/PuppeteerHelper.js';
import { ImageSearch } from './plugins/image-search/ImageSearch.js';
import { WebSearch } from './plugins/web-search/WebSearch.js';
import PQueue from 'p-queue';
import { Cache } from 'cache-manager';
import { BoundLlmClient } from './core/BoundLlmClient.js';
import { GlobalsConfig, StepConfig as ZodStepConfig } from './config/types.js';

// --- Service Capabilities (for validation at startup) ---

export interface ServiceCapabilities {
    hasSerper: boolean;
    hasPuppeteer: boolean;
}

// --- Definitions (Pre-Load) ---

export interface ModelDefinition {
    model?: string;
    temperature?: number;
    thinkingLevel?: 'low' | 'medium' | 'high';
    systemSource?: string;
    promptSource?: string;
}

export type OutputMode = 'merge' | 'column' | 'ignore';

export interface OutputStrategy {
    mode: OutputMode;
    columnName?: string;
    explode: boolean;
}

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
    dataFilePath?: string;
    global: GlobalsConfig;
    steps: StepDefinition[];
    data: {
        format: string;
        offset?: number;
        limit?: number;
    };
}

// --- Resolved Configuration (Post-Load) ---

export interface ResolvedModelConfig {
    model?: string;
    temperature?: number;
    thinkingLevel?: 'low' | 'medium' | 'high';

    systemParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    promptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

export interface StepConfig {
    modelConfig: ResolvedModelConfig;
    tmpDir: string;
    userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];

    outputPath?: string;
    outputTemplate?: string;
    output: OutputStrategy;

    schemaPath?: string;
    jsonSchema?: any;
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
}

export interface RuntimeConfig {
    concurrency: number;
    taskConcurrency: number;
    tmpDir: string;
    dataFilePath?: string;
    dataOutputPath?: string;
    steps: StepConfig[];
    data: Record<string, any>[];
    options?: Record<string, any>;
    offset?: number;
    limit?: number;
}

// Compatibility / Aliases
export interface ModelConfig extends ModelDefinition {}

// --- Execution Architecture ---

export interface PipelineItem {
    row: Record<string, any>;
    workspace: Record<string, any>;
    stepHistory: Record<string, any>[];
    history: any[];
    originalIndex: number;

    /** 0-based index if this item was created via explosion */
    variationIndex?: number;
    /** The specific content accumulated for this specific item path */
    accumulatedContent: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

// --- Dependency Injection Contexts ---

export interface GlobalContext {
    openai: OpenAI;

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
}

export interface StepContext {
    global: GlobalContext;

    // Pre-configured LLM clients with prompts bound
    llm: BoundLlmClient;
    judge?: BoundLlmClient;
    feedback?: BoundLlmClient;

    // Factory for plugins to create clients with bound prompts
    createLlm(config: ResolvedModelConfig): BoundLlmClient;
}
