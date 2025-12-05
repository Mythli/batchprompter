import OpenAI from 'openai';

// --- Definitions (Pre-Load) ---

export interface ModelDefinition {
    model: string;
    temperature?: number;
    thinkingLevel?: 'low' | 'medium' | 'high';
    systemSource?: string;
    promptSource?: string;
}

export interface PluginConfigDefinition {
    name: string;
    config: any;
    // Output Strategies
    outputColumn?: string; // NEW: Save to specific column
    merge: boolean;        // NEW: Merge into row
}

export interface StepDefinition {
    stepIndex: number;
    modelConfig: ModelDefinition;
    
    // IO
    outputPath?: string;
    outputColumn?: string;
    outputTemplate?: string;
    exportResult: boolean; // NEW: Whether to merge the LLM result into the final output row
    strategy: 'run' | 'explode'; // NEW: 'run' (linear, optional merge) vs 'explode' (branching)
    
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
}

export interface NormalizedConfig {
    dataFilePath: string;
    global: {
        concurrency: number;
        taskConcurrency: number;
        tmpDir: string;
        dataOutputPath?: string;
        model: string; // Global default model
    };
    steps: StepDefinition[];
}

// --- Resolved Configuration (Post-Load) ---

export interface ResolvedModelConfig {
    model: string;
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
    outputColumn?: string;
    outputTemplate?: string; 
    exportResult: boolean; // NEW
    strategy: 'run' | 'explode'; // NEW
    
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

    // --- NEW: Pre-calculated Paths ---
    resolvedOutputDir?: string; // The final destination folder (e.g., out/10-image/BoulderHall)
    resolvedTempDir?: string;   // The isolated temp folder (e.g., .tmp/001_02)
    
    // NEW: Filename components
    outputBasename?: string;    // e.g. "04_AboutCourseFirstImage"
    outputExtension?: string;   // e.g. ".jpg"
}

export interface RuntimeConfig {
    concurrency: number;
    taskConcurrency: number;
    tmpDir: string;
    dataFilePath: string;
    dataOutputPath?: string;
    steps: StepConfig[];
    data: Record<string, any>[];
}

// Compatibility / Aliases
export interface ModelConfig extends ModelDefinition {}
export interface ActionOptions extends RuntimeConfig {}
