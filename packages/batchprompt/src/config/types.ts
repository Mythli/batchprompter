import { z } from 'zod';
import OpenAI from 'openai';
import { 
    OutputConfigSchema, 
    ModelConfigSchema 
} from './schemas/index.js';

// =============================================================================
// Schema-Derived Types
// =============================================================================

export type OutputConfig = z.infer<typeof OutputConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

// Alias for backward compatibility
export type ResolvedOutputConfig = OutputConfig;

// =============================================================================
// Prompt Types
// =============================================================================

export type PromptDef = string | {
    file?: string;
    text?: string;
    parts?: { type: 'text' | 'image' | 'audio'; content: string }[];
};

// =============================================================================
// Resolved Types (Runtime-only, have ContentParts)
// =============================================================================

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

// =============================================================================
// Service Configuration
// =============================================================================

export interface ServiceCapabilities {
    hasSerper: boolean;
    hasPuppeteer: boolean;
}

// =============================================================================
// Step Configuration (Runtime)
// =============================================================================

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

    // Plugins
    plugins: ResolvedPluginBase[];

    // Judge & Feedback
    judge?: ModelConfig;
    feedback?: ModelConfig & { loops: number };
    feedbackLoops?: number; // Derived from feedback.loops for convenience

    // Misc
    aspectRatio?: string;
    
    // Resolved Paths (set by StepResolver at runtime)
    resolvedOutputDir?: string;
    resolvedTempDir?: string;
    outputBasename?: string;
    outputExtension?: string;

    // Shell Commands
    verifyCommand?: string;
    command?: string;
    skipCandidateCommand?: boolean;
    
    // Resolved Prompts (set by StepResolver at runtime)
    userPromptParts?: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    
    // Temp dir for this step
    tmpDir?: string;
}

export type ResolvedStepConfig = StepConfig;

// =============================================================================
// Global & Pipeline Configuration
// =============================================================================

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

export interface RuntimeConfig extends GlobalsConfig {
    steps: StepConfig[];
    data: Record<string, any>[];
}

export type ResolvedPipelineConfig = RuntimeConfig;
