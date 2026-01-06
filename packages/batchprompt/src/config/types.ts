import { z } from 'zod';
import OpenAI from 'openai';
import { ModelConfig } from './schemas/model.js';
import { OutputConfigSchema } from './common.js';

// Re-export
export { ModelConfig };

export type OutputConfig = z.infer<typeof OutputConfigSchema>;
export type ResolvedOutputConfig = OutputConfig;

export interface ResolvedModelConfig {
    model?: string;
    temperature?: number;
    thinkingLevel?: 'low' | 'medium' | 'high';
    systemParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    promptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

export interface ResolvedPluginBase {
    type: string;
    id: string;
    output: OutputConfig;
    rawConfig?: any;
}

export interface ServiceCapabilities {
    hasSerper: boolean;
    hasPuppeteer: boolean;
}

// The Runtime Step Config (Flattened)
export interface StepConfig {
    // Model Object
    model: ModelConfig;
    
    // Execution
    timeout: number;
    candidates: number;
    
    // I/O
    output: OutputConfig;
    outputPath?: string;
    outputTemplate?: string; // Alias for outputPath
    
    // Validation
    schema?: any; // Object or Template String
    schemaPath?: string; // Legacy alias
    jsonSchema?: any; // Alias for schema

    // Plugins
    plugins: ResolvedPluginBase[];

    // Judge & Feedback
    judge?: ModelConfig;
    feedback?: ModelConfig & { loops: number };
    feedbackLoops?: number; // Alias for feedback.loops

    // Misc
    aspectRatio?: string;
    
    // Resolved Paths
    resolvedOutputDir?: string;
    resolvedTempDir?: string;
    outputBasename?: string;
    outputExtension?: string;

    // Legacy
    verifyCommand?: string;
    postProcessCommand?: string;
    noCandidateCommand?: boolean;
    command?: string;
    skipCandidateCommand?: boolean;
    
    // Resolved Prompts (for internal use if needed, but we use model.prompt now)
    userPromptParts?: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    
    // Temp dir for this step
    tmpDir?: string;
}

export type ResolvedStepConfig = StepConfig;

export interface GlobalsConfig {
    model?: string;
    temperature?: number;
    thinkingLevel?: 'low' | 'medium' | 'high';
    concurrency: number;
    taskConcurrency: number;
    tmpDir: string;
    outputPath?: string;
    dataOutputPath?: string;
    timeout: number;
    inputLimit?: number;
    inputOffset?: number;
    limit?: number;
    offset?: number;
}

export interface RuntimeConfig {
    concurrency: number;
    taskConcurrency: number;
    tmpDir: string;
    dataOutputPath?: string;
    steps: StepConfig[];
    data: Record<string, any>[];
    offset?: number;
    limit?: number;
    inputOffset?: number;
    inputLimit?: number;
    globals: GlobalsConfig;
}

export type ResolvedPipelineConfig = RuntimeConfig;

export type PromptDef = string | {
    file?: string;
    text?: string;
    parts?: { type: 'text' | 'image' | 'audio'; content: string }[];
};
