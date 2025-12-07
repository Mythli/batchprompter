import OpenAI from 'openai';

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
    columnName?: string; // The target key (if mode is 'column' or fallback for 'merge')
    explode: boolean;    // Whether to split array results into multiple rows
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
    
    // IO
    outputPath?: string;
    outputTemplate?: string;
    
    // Replaces exportResult, outputColumn, strategy
    output: OutputStrategy;
    
    // Validation
    schemaPath?: string;
    verifyCommand?: string;
    postProcessCommand?: string;
    
    // Candidates
    candidates: number;
    noCandidateCommand: boolean;
    
    // Auxiliary
    judge?: ModelDefinition;
    feedback?: ModelDefinition;
    feedbackLoops: number;
    
    aspectRatio?: string;

    // Plugins (Ordered List)
    plugins: PluginConfigDefinition[];
    
    // Preprocessors
    preprocessors: PreprocessorConfigDefinition[];
}

export interface NormalizedConfig {
    dataFilePath: string;
    global: {
        concurrency: number;
        taskConcurrency: number;
        tmpDir: string;
        dataOutputPath?: string;
        model?: string; // Global default model
    };
    steps: StepDefinition[];
}

// --- Resolved Configuration (Post-Load) ---

export interface ResolvedModelConfig {
    model?: string;
    temperature?: number;
    thinkingLevel?: 'low' | 'medium' | 'high';
    
    // Resolved Content
    systemParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    promptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

export interface StepConfig {
    modelConfig: ResolvedModelConfig;

    // Execution Logic
    tmpDir: string;
    
    // Inputs
    userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[]; 
    
    // Outputs
    outputPath?: string;
    outputTemplate?: string; 
    
    // Replaces exportResult, outputColumn, strategy
    output: OutputStrategy;
    
    // Validation & Post-processing
    schemaPath?: string;
    jsonSchema?: any; 
    verifyCommand?: string;
    postProcessCommand?: string;
    
    // Candidates & Judging
    candidates: number;
    noCandidateCommand: boolean;
    
    // Auxiliary Models
    judge?: ResolvedModelConfig;
    feedback?: ResolvedModelConfig;
    feedbackLoops: number;
    
    // Image Generation
    aspectRatio?: string;

    // Plugins (Ordered List)
    plugins: PluginConfigDefinition[];
    
    // Preprocessors
    preprocessors: PreprocessorConfigDefinition[];

    // --- NEW: Pre-calculated Paths ---
    resolvedOutputDir?: string; // The final destination folder (e.g., out/10-image/BoulderHall)
    resolvedTempDir?: string;   // The isolated temp folder (e.g., .tmp/001_02)
    
    // NEW: Filename components
    outputBasename?: string;    // e.g. "04_AboutCourseFirstImage"
    outputExtension?: string;   // e.g. ".jpg"

    // NEW: Raw Options for Preprocessors
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
}

// Compatibility / Aliases
export interface ModelConfig extends ModelDefinition {}
export interface ActionOptions extends RuntimeConfig {}

// --- Execution Architecture ---

export interface PipelineItem {
    // The persistent data that will eventually be saved to the CSV/JSON
    row: Record<string, any>;
    
    // The transient data available for templating ({{webSearch.link}}, {{steps.0.result}})
    // This accumulates results from plugins and previous steps but is NOT saved to output unless exported.
    workspace: Record<string, any>;
    
    // Metadata for execution tracking
    stepHistory: Record<string, any>[]; // Results from previous steps
    history: any[]; // LLM Conversation History
    originalIndex: number; // For logging/debugging
}
