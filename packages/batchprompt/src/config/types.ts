import OpenAI from 'openai';
import { z } from 'zod';
import { 
    OutputConfigSchema, 
    ModelConfigSchema,
    BaseModelConfigSchema
} from './schemas/index.js';
import { GlobalsConfigSchema, StepConfigSchema } from './schema.js';

// =============================================================================
// Schema-Derived Types (Re-export from schemas)
// =============================================================================

export type OutputConfig = z.infer<typeof OutputConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type BaseModelConfig = z.infer<typeof BaseModelConfigSchema>;

// Alias for backward compatibility
export type ResolvedOutputConfig = OutputConfig;

// =============================================================================
// Prompt Types
// =============================================================================

// PromptDef must match the PromptSchema union which includes any[] for ContentParts
export type PromptDef = string | any[] | {
    file?: string;
    text?: string;
    parts?: any[];
};

// =============================================================================
// Service Configuration
// =============================================================================

export interface ServiceCapabilities {
    hasSerper: boolean;
    hasPuppeteer: boolean;
}

// =============================================================================
// Resolved Types (Runtime-only, created by StepResolver)
// =============================================================================

/**
 * Model config after prompts are loaded into ContentParts.
 * This is a RUNTIME type, not a schema type.
 */
export interface ResolvedModelConfig {
    model?: string;
    temperature?: number;
    thinkingLevel?: 'low' | 'medium' | 'high';
    systemParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    promptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

/**
 * Plugin config after resolution.
 * This is a RUNTIME type with resolved ID and raw config preserved.
 */
export interface ResolvedPluginBase {
    type: string;
    id: string;
    output: OutputConfig;
    rawConfig?: any;
}

// =============================================================================
// Step Configuration (Runtime)
// =============================================================================

// Base type from Zod schema
type StepConfigBase = z.infer<typeof StepConfigSchema>;

/**
 * Step configuration at runtime.
 * Extends the parsed schema with:
 * - Resolved plugins (instead of raw plugin configs)
 * - Runtime-resolved paths and prompts
 */
export interface StepConfig extends Omit<StepConfigBase, 'plugins'> {
    // Override plugins with resolved type
    plugins: ResolvedPluginBase[];
    
    // Model is required at runtime (with defaults applied)
    model: ModelConfig;
    
    // Timeout is required at runtime (with default applied)
    timeout: number;
    
    // Derived convenience field
    feedbackLoops?: number;
    
    // Resolved paths (set by StepResolver)
    resolvedOutputDir?: string;
    resolvedTempDir?: string;
    outputBasename?: string;
    outputExtension?: string;
    
    // Alias for outputPath
    outputTemplate?: string;
    
    // Resolved prompts (set by StepResolver)
    userPromptParts?: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    
    // Shell commands (from ShellPlugin mapping)
    verifyCommand?: string;
    command?: string;
    skipCandidateCommand?: boolean;
    
    // Step-specific temp dir
    tmpDir?: string;
}

export type ResolvedStepConfig = StepConfig;

// =============================================================================
// Global & Pipeline Configuration (Runtime)
// =============================================================================

// Base type from Zod schema
type GlobalsConfigBase = z.infer<typeof GlobalsConfigSchema>;

export interface GlobalsConfig extends GlobalsConfigBase {}

export interface RuntimeConfig extends GlobalsConfig {
    steps: StepConfig[];
    data: Record<string, any>[];
}

export type ResolvedPipelineConfig = RuntimeConfig;
