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
    candidateOutputTemplate?: string;
    noCandidateCommand?: boolean;
    feedbackLoops?: number;
    feedbackPrompt?: string;
    feedbackModel?: string;
}

export interface ActionOptions {
    concurrency: number;
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
    candidateOutputTemplate?: string;
    noCandidateCommand?: boolean;
    feedbackLoops?: number;
    feedbackPrompt?: string;
    feedbackModel?: string;
    stepOverrides?: Record<number, StepConfig>;
}
