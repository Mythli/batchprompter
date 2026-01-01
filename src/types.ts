import OpenAI from 'openai';
import PQueue from 'p-queue';
import { BoundLlmClient } from './core/BoundLlmClient.js';
import { GlobalsConfig } from './config/types.js';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from './core/events.js';

// --- Definitions ---

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
    limit?: number;
    offset?: number;
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
    dataFilePath?: string;
    global: GlobalsConfig;
    steps: StepDefinition[];
    data: {
        format: string;
        offset?: number;
        limit?: number;
    };
}

// --- Resolved Configuration ---

export interface ResolvedModelConfig {
    model?: string;
    temperature?: number;
    thinkingLevel?: 'low' | 'medium' | 'high';

    systemParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    promptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

export interface StepExecutionContext {
    row: Record<string, any>;
    workspace: Record<string, any>;
    stepIndex: number;
    rowIndex: number;
    history: any[];
}

export interface StepHandlers {
    /** Runs before step execution. Can modify context. */
    prepare?: (context: StepExecutionContext) => Promise<void>;
    
    /** Runs to verify content. Returns validity and feedback. */
    verify?: (content: any, context: StepExecutionContext) => Promise<{ isValid: boolean; feedback?: string }>;
    
    /** Runs after step execution. Can save artifacts, modify result, etc. */
    process?: (context: StepExecutionContext, result: any) => Promise<void>;
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
    dataFilePath?: string;
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

    // Queues for concurrency management
    gptQueue: PQueue;
    taskQueue: PQueue;

    defaultModel: string;
}

export interface StepContext {
    global: GlobalContext;
    llm: BoundLlmClient;
    judge?: BoundLlmClient;
    feedback?: BoundLlmClient;
    createLlm(config: ResolvedModelConfig): BoundLlmClient;
}
