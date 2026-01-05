import { z } from 'zod';
import OpenAI from 'openai';
import {
    PipelineConfigSchema,
    GlobalsConfigSchema,
    StepConfigSchema,
    OutputConfigSchema,
    PromptDefSchema,
} from './schema.js';
import { StepHandlers } from '../plugins/types.js';

// =============================================================================
// Inferred Types from Zod Schemas (Raw Config)
// =============================================================================

export type PromptDef = z.infer<typeof PromptDefSchema>;
export type OutputConfig = z.infer<typeof OutputConfigSchema>;
export type GlobalsConfig = z.infer<typeof GlobalsConfigSchema>;
export type RawStepConfig = z.infer<typeof StepConfigSchema>;
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
    limit?: number;
    offset?: number;
}

export interface ResolvedPluginBase {
    type: string;
    id: string;
    output: ResolvedOutputConfig;
    rawConfig?: any;
}

export interface ServiceCapabilities {
    hasSerper: boolean;
    hasPuppeteer: boolean;
}

export interface ResolvedStepConfig {
    prompt: ResolvedPrompt;
    system: ResolvedPrompt;
    model: string;
    temperature?: number;
    thinkingLevel?: 'low' | 'medium' | 'high';
    plugins: ResolvedPluginBase[];
    output: ResolvedOutputConfig;
    outputTemplate?: string;
    schema?: any;
    candidates: number;
    judge?: ResolvedModelConfig;
    feedback?: ResolvedModelConfig & { loops: number };
    aspectRatio?: string;
    tmpDir: string;
    outputDir?: string;
    outputBasename?: string;
    outputExtension?: string;
    timeout: number;
    
    // Handlers for logic injection
    handlers?: StepHandlers;
    
    // Legacy/Compat fields
    skipCandidateCommand?: boolean;
    command?: string;
    verifyCommand?: string;
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
