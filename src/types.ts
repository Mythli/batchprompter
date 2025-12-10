import OpenAI from 'openai';
import { LlmClient, Fetcher } from 'llm-fns';
import { PuppeteerHelper } from './utils/puppeteer/PuppeteerHelper.js';
import { ImageSearch } from './plugins/image-search/ImageSearch.js';
import { WebSearch } from './plugins/web-search/WebSearch.js';
import PQueue from 'p-queue';
import { Cache } from 'cache-manager';

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
}

export interface NormalizedConfig {
    dataFilePath: string;
    global: {
        concurrency?: number;
        taskConcurrency?: number;
        tmpDir: string;
        dataOutputPath?: string;
        model?: string;
        offset?: number;
        limit?: number;
    };
    steps: StepDefinition[];
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
}

export interface RuntimeConfig {
    concurrency: number;
    taskConcurrency: number;
    tmpDir: string;
    dataFilePath: string;
    dataOutputPath?: string;
    steps: StepConfig[];
    data: Record<string, any>[];
    options?: Record<string, any>;
    offset?: number;
    limit?: number;
}

// Compatibility / Aliases
export interface ModelConfig extends ModelDefinition {}
export interface ActionOptions extends RuntimeConfig {}

// --- Execution Architecture ---

export interface PipelineItem {
    row: Record<string, any>;
    workspace: Record<string, any>;
    stepHistory: Record<string, any>[];
    history: any[];
    originalIndex: number;
}

// --- LLM Configuration for Factory ---

export interface LlmModelConfig {
    model: string;
    temperature?: number;
    thinkingLevel?: 'low' | 'medium' | 'high';
}

// --- Dependency Injection Contexts ---

export interface GlobalContext {
    // Core OpenAI instance (shared)
    openai: OpenAI;
    
    // Caching & Queuing (shared)
    cache?: Cache;
    gptQueue: PQueue;
    serperQueue: PQueue;
    puppeteerQueue: PQueue;
    
    // Services (guaranteed to exist)
    puppeteerHelper: PuppeteerHelper;
    fetcher: Fetcher;
    
    // Services (may be undefined based on env - validated at normalize time)
    imageSearch?: ImageSearch;
    webSearch?: WebSearch;
    
    // Capabilities (for validation)
    capabilities: ServiceCapabilities;
    
    // Default model from config
    defaultModel: string;
}

export interface StepContext {
    global: GlobalContext;
    
    // Pre-configured LLM clients for this step
    llm: LlmClient;
    judge?: LlmClient;
    feedback?: LlmClient;
    
    // Factory for plugins to create ad-hoc clients
    createLlm(config: LlmModelConfig): LlmClient;
}
