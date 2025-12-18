import { z } from 'zod';
import OpenAI from 'openai';
import {
    PipelineConfigSchema,
    GlobalsConfigSchema,
    DataConfigSchema,
    StepConfigSchema,
    ModelConfigSchema,
    OutputConfigSchema,
    PromptDefSchema,
    FeedbackConfigSchema
} from './schema.js';

// =============================================================================
// Inferred Types from Zod Schemas (Raw Config)
// =============================================================================

export type PromptDef = z.infer<typeof PromptDefSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type OutputConfig = z.infer<typeof OutputConfigSchema>;
export type FeedbackConfig = z.infer<typeof FeedbackConfigSchema>;
export type DataConfig = z.infer<typeof DataConfigSchema>;
export type GlobalsConfig = z.infer<typeof GlobalsConfigSchema>;
export type StepConfig = z.infer<typeof StepConfigSchema>;
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;

// =============================================================================
// Resolved Types (After Loading Files, Rendering Templates)
// =============================================================================

export interface ResolvedPrompt {
    parts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

export interface ResolvedModelConfig {
    model?: string;
    temperature?: number;
    thinkingLevel?: 'low' | 'medium' | 'high';
    systemParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    promptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

export interface ResolvedOutputConfig {
    mode: 'merge' | 'column' | 'ignore';
    column?: string;
    explode: boolean;
}

export interface ResolvedPluginBase {
    type: string;
    id: string;
    output: ResolvedOutputConfig;
}

export interface ResolvedStepConfig {
    prompt: ResolvedPrompt;
    system: ResolvedPrompt;
    model: string;
    temperature?: number;
    thinkingLevel?: 'low' | 'medium' | 'high';
    plugins: ResolvedPluginBase[];
    output: ResolvedOutputConfig;
    schema?: any;
    candidates: number;
    skipCandidateCommand: boolean;
    judge?: ResolvedModelConfig;
    feedback?: ResolvedModelConfig & { loops: number };
    aspectRatio?: string;
    command?: string;
    verifyCommand?: string;
    tmpDir: string;
    outputDir?: string;
    outputBasename?: string;
    outputExtension?: string;
    timeout: number;
}

export interface ResolvedPipelineConfig {
    data: {
        rows: Record<string, any>[];
        offset: number;
        limit?: number;
    };
    globals: GlobalsConfig;
    steps: ResolvedStepConfig[];
}

// =============================================================================
// Runtime Types
// =============================================================================

export interface PipelineItem {
    row: Record<string, any>;
    workspace: Record<string, any>;
    stepHistory: Record<string, any>[];
    history: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    originalIndex: number;
    variationIndex?: number;
    accumulatedContent: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

export interface ServiceCapabilities {
    hasSerper: boolean;
    hasPuppeteer: boolean;
}

export interface NormalizedConfig {
    global: GlobalsConfig;
    steps: import('../types.js').StepDefinition[];
}

export interface RuntimeConfig {
    concurrency: number;
    taskConcurrency: number;
    tmpDir: string;
    dataOutputPath?: string;
    steps: import('../types.js').StepConfig[];
    data: Record<string, any>[];
    options?: Record<string, any>;
    offset?: number;
    limit?: number;
}
