import OpenAI from 'openai';

export interface StepConfig {
    system?: string;
    schema?: string;
    jsonSchema?: any;
    verifyCommand?: string;
    postProcessCommand?: string;
    aspectRatio?: string;
    outputTemplate?: string;
    outputColumn?: string;
    candidates?: number;
    judgeModel?: string;
    judgePrompt?: string;
    noCandidateCommand?: boolean;
    feedbackLoops?: number;
    feedbackPrompt?: string;
    feedbackModel?: string;
    
    // Image Search Specific
    imageSearchQuery?: string;
    imageSearchPrompt?: string; // Prompt to generate queries
    imageSelectPrompt?: string; // Prompt to select images (Optional)
    imageSearchLimit?: number; // Images per query
    imageSearchSelect?: number; // Max images to select/return
    imageSearchQueryCount?: number; // Number of queries to generate
    imageSearchSpriteSize?: number; // Number of images per sprite grid
}

export interface ActionOptions {
    concurrency: number;
    tmpDir: string;
    aspectRatio?: string;
    model?: string;
    system?: string;
    schema?: string;
    jsonSchema?: any;
    verifyCommand?: string;
    postProcessCommand?: string;
    outputColumn?: string;
    dataOutput?: string;
    candidates?: number;
    judgeModel?: string;
    judgePrompt?: string;
    noCandidateCommand?: boolean;
    feedbackLoops?: number;
    feedbackPrompt?: string;
    feedbackModel?: string;
    
    // Image Search Global Defaults
    imageSearchQuery?: string;
    imageSearchPrompt?: string;
    imageSelectPrompt?: string;
    imageSearchLimit?: number;
    imageSearchSelect?: number;
    imageSearchQueryCount?: number;
    imageSearchSpriteSize?: number;

    stepOverrides?: Record<number, StepConfig>;
}
