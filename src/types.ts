import OpenAI from 'openai';

// --- Model Configuration ---

/**
 * Represents the raw configuration for a model from CLI/Args.
 * Stores the *source* of the prompts (file path or raw text).
 */
export interface ModelConfig {
    model: string;
    temperature?: number;
    thinkingLevel?: 'low' | 'medium' | 'high';
    
    // Input Sources (File Path or Raw Text)
    systemSource?: string; 
    promptSource?: string;
}

/**
 * Represents a model configuration with prompts resolved to ContentParts.
 * This is what the execution layer uses.
 */
export interface ResolvedModelConfig {
    model: string;
    temperature?: number;
    thinkingLevel?: 'low' | 'medium' | 'high';
    
    // Resolved Content
    systemParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    promptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

// --- Step Configuration ---

/**
 * Configuration for a single workflow step.
 * Extends ResolvedModelConfig because the Step *is* the Main Agent.
 */
export interface StepConfig extends ResolvedModelConfig {
    // Execution Logic
    tmpDir: string;
    
    // Inputs
    // Content from positional arguments (template files)
    userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[]; 
    
    // Outputs
    outputPath?: string;
    outputColumn?: string;
    outputTemplate?: string; // Raw template for dynamic resolution
    
    // Validation & Post-processing
    schemaPath?: string;
    jsonSchema?: any; // Loaded schema object
    verifyCommand?: string;
    postProcessCommand?: string;
    
    // Candidates & Judging
    candidates: number;
    noCandidateCommand: boolean;
    
    // Auxiliary Models (Judge & Feedback)
    judge?: ResolvedModelConfig;
    feedback?: ResolvedModelConfig;
    feedbackLoops: number;
    
    // Image Search (Specific to the step)
    imageSearch?: {
        query?: string;
        prompt?: string; // Raw prompt text/path
        promptParts?: OpenAI.Chat.Completions.ChatCompletionContentPart[]; // Resolved
        limit: number;
        select: number;
        queryCount: number;
        spriteSize: number;
        selectPrompt?: string; // Raw prompt text/path
        selectPromptParts?: OpenAI.Chat.Completions.ChatCompletionContentPart[]; // Resolved
    };
    
    // Image Generation
    aspectRatio?: string;
}

// --- Runtime Configuration ---

export interface RuntimeConfig {
    concurrency: number;
    taskConcurrency: number;
    tmpDir: string;
    dataFilePath: string;
    dataOutputPath?: string;
    
    // The fully resolved configuration for each step (0-based index)
    // steps[0] = Step 1, steps[1] = Step 2...
    steps: StepConfig[];
    
    // Loaded Data
    data: Record<string, any>[];
}

// Deprecated but kept for compatibility during refactor if needed
export interface ActionOptions extends RuntimeConfig {}
