import Handlebars from 'handlebars';
import path from 'path';
import OpenAI from 'openai';
import { ActionOptions } from './types.js';
import { aggressiveSanitize } from './utils/fileUtils.js';

export interface ResolvedStepConfig {
    tmpDir: string;
    outputPath: string | null;
    outputColumn: string | null;
    systemPrompt: string | null;
    validator: any;
    jsonSchema: any;
    verifyCommand: string | null;
    postProcessCommand: string | null;
    aspectRatio: string | undefined;
    candidates: number;
    judgeModel: string | undefined;
    judgePromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] | undefined;
    candidateOutputTemplate: string | undefined;
    noCandidateCommand: boolean;
    feedbackLoops: number;
    feedbackPrompt: OpenAI.Chat.Completions.ChatCompletionContentPart[] | undefined;
    feedbackModel: string | undefined;
    
    // Image Search
    imageSearchQuery: string | null;
    imageSearchPrompt: OpenAI.Chat.Completions.ChatCompletionContentPart[] | undefined;
    imageSelectPrompt: OpenAI.Chat.Completions.ChatCompletionContentPart[] | undefined;
    imageSearchLimit: number;
    imageSearchSelect: number;
}

export class StepConfigurator {
    static resolve(
        row: Record<string, any>,
        stepIndex: number,
        totalSteps: number,
        options: ActionOptions,
        baseOutputPath: string,
        renderedSystemPrompts: { global: string | null, steps: Record<number, string> },
        loadedJudgePrompts: { global: OpenAI.Chat.Completions.ChatCompletionContentPart[] | null, steps: Record<number, OpenAI.Chat.Completions.ChatCompletionContentPart[]> },
        loadedFeedbackPrompts: { global: OpenAI.Chat.Completions.ChatCompletionContentPart[] | null, steps: Record<number, OpenAI.Chat.Completions.ChatCompletionContentPart[]> },
        loadedImageSearchPrompts: { global: OpenAI.Chat.Completions.ChatCompletionContentPart[] | null, steps: Record<number, OpenAI.Chat.Completions.ChatCompletionContentPart[]> },
        loadedImageSelectPrompts: { global: OpenAI.Chat.Completions.ChatCompletionContentPart[] | null, steps: Record<number, OpenAI.Chat.Completions.ChatCompletionContentPart[]> },
        validators: Record<string, any>
    ): ResolvedStepConfig {
        const stepOverride = options.stepOverrides?.[stepIndex];

        // 1. Output Path
        let currentOutputPath: string | null = null;
        if (stepOverride?.outputTemplate) {
             const delegate = Handlebars.compile(stepOverride.outputTemplate, { noEscape: true });
             const sanitizedRow: Record<string, string> = {};
             for (const [key, val] of Object.entries(row)) {
                 const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
                 const sanitized = aggressiveSanitize(stringVal);
                 sanitizedRow[key] = sanitized;
             }
             currentOutputPath = delegate(sanitizedRow);
        } else if (baseOutputPath) {
            currentOutputPath = this.getIndexedPath(baseOutputPath, stepIndex, totalSteps);
        }

        // 2. Output Column
        let currentOutputColumn = stepOverride?.outputColumn || options.outputColumn;
        if (currentOutputColumn) {
            const delegate = Handlebars.compile(currentOutputColumn, { noEscape: true });
            currentOutputColumn = delegate(row);
        }

        // 3. System Prompt
        let currentSystemPrompt: string | null = (renderedSystemPrompts.steps[stepIndex] as string | undefined) ?? null;
        if (currentSystemPrompt === null) {
            currentSystemPrompt = renderedSystemPrompts.global || null;
        }

        // 4. Validator / Schema
        let currentValidator = validators[stepIndex];
        let currentSchemaObj = stepOverride?.jsonSchema;

        if (!currentValidator && !currentSchemaObj) {
            currentValidator = validators['global'];
            currentSchemaObj = options.jsonSchema;
        }

        // 5. Commands
        const currentVerifyCommand = stepOverride?.verifyCommand || options.verifyCommand;
        const currentPostProcessCommand = stepOverride?.postProcessCommand || options.postProcessCommand;

        // 6. Aspect Ratio
        const currentAspectRatio = stepOverride?.aspectRatio || options.aspectRatio;

        // 7. Candidates & Judge
        const currentCandidates = stepOverride?.candidates || options.candidates || 1;
        const currentJudgeModel = stepOverride?.judgeModel || options.judgeModel;
        
        // Resolve Judge Prompt Parts (Handlebars rendering)
        let rawJudgeParts = loadedJudgePrompts.steps[stepIndex];
        if (!rawJudgeParts && loadedJudgePrompts.global) {
            rawJudgeParts = loadedJudgePrompts.global;
        }

        let currentJudgePromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] | undefined;
        if (rawJudgeParts) {
            currentJudgePromptParts = rawJudgeParts.map(part => {
                if (part.type === 'text') {
                    return {
                        type: 'text',
                        text: Handlebars.compile(part.text, { noEscape: true })(row)
                    };
                }
                return part;
            });
        }
        
        // 8. Candidate Output & Command Control
        const currentCandidateOutputTemplate = stepOverride?.candidateOutputTemplate || options.candidateOutputTemplate;
        // Boolean flags: check step override first, then global. If undefined, default to false.
        const currentNoCandidateCommand = stepOverride?.noCandidateCommand ?? options.noCandidateCommand ?? false;

        // 9. Feedback Loop
        const currentFeedbackLoops = stepOverride?.feedbackLoops ?? options.feedbackLoops ?? 0;
        
        // Resolve Feedback Prompt
        let rawFeedbackParts = loadedFeedbackPrompts.steps[stepIndex];
        if (!rawFeedbackParts && loadedFeedbackPrompts.global) {
            rawFeedbackParts = loadedFeedbackPrompts.global;
        }

        let currentFeedbackPrompt: OpenAI.Chat.Completions.ChatCompletionContentPart[] | undefined;
        if (rawFeedbackParts) {
            currentFeedbackPrompt = rawFeedbackParts.map(part => {
                if (part.type === 'text') {
                    return {
                        type: 'text',
                        text: Handlebars.compile(part.text, { noEscape: true })(row)
                    };
                }
                return part;
            });
        }
        
        const currentFeedbackModel = stepOverride?.feedbackModel || options.feedbackModel;

        // 10. Image Search
        const currentImageSearchQuery = stepOverride?.imageSearchQuery || options.imageSearchQuery || null;
        let renderedImageSearchQuery: string | null = null;
        if (currentImageSearchQuery) {
            renderedImageSearchQuery = Handlebars.compile(currentImageSearchQuery, { noEscape: true })(row);
        }

        // Resolve Image Search Prompt
        let rawSearchPromptParts = loadedImageSearchPrompts.steps[stepIndex];
        if (!rawSearchPromptParts && loadedImageSearchPrompts.global) {
            rawSearchPromptParts = loadedImageSearchPrompts.global;
        }
        let currentImageSearchPrompt: OpenAI.Chat.Completions.ChatCompletionContentPart[] | undefined;
        if (rawSearchPromptParts) {
            currentImageSearchPrompt = rawSearchPromptParts.map(part => {
                if (part.type === 'text') {
                    return { type: 'text', text: Handlebars.compile(part.text, { noEscape: true })(row) };
                }
                return part;
            });
        }

        // Resolve Image Select Prompt
        let rawSelectPromptParts = loadedImageSelectPrompts.steps[stepIndex];
        if (!rawSelectPromptParts && loadedImageSelectPrompts.global) {
            rawSelectPromptParts = loadedImageSelectPrompts.global;
        }
        let currentImageSelectPrompt: OpenAI.Chat.Completions.ChatCompletionContentPart[] | undefined;
        if (rawSelectPromptParts) {
            currentImageSelectPrompt = rawSelectPromptParts.map(part => {
                if (part.type === 'text') {
                    return { type: 'text', text: Handlebars.compile(part.text, { noEscape: true })(row) };
                }
                return part;
            });
        }

        const currentImageSearchLimit = stepOverride?.imageSearchLimit ?? options.imageSearchLimit ?? 10;
        const currentImageSearchSelect = stepOverride?.imageSearchSelect ?? options.imageSearchSelect ?? 1;

        return {
            tmpDir: options.tmpDir,
            outputPath: currentOutputPath,
            outputColumn: currentOutputColumn || null,
            systemPrompt: currentSystemPrompt,
            validator: currentValidator,
            jsonSchema: currentSchemaObj,
            verifyCommand: currentVerifyCommand || null,
            postProcessCommand: currentPostProcessCommand || null,
            aspectRatio: currentAspectRatio,
            candidates: currentCandidates,
            judgeModel: currentJudgeModel,
            judgePromptParts: currentJudgePromptParts,
            candidateOutputTemplate: currentCandidateOutputTemplate,
            noCandidateCommand: currentNoCandidateCommand,
            feedbackLoops: currentFeedbackLoops,
            feedbackPrompt: currentFeedbackPrompt,
            feedbackModel: currentFeedbackModel,
            
            imageSearchQuery: renderedImageSearchQuery,
            imageSearchPrompt: currentImageSearchPrompt,
            imageSelectPrompt: currentImageSelectPrompt,
            imageSearchLimit: currentImageSearchLimit,
            imageSearchSelect: currentImageSearchSelect
        };
    }

    private static getIndexedPath(basePath: string, stepIndex: number, totalSteps: number): string {
        if (totalSteps <= 1) return basePath;
        const ext = path.extname(basePath);
        const name = path.basename(basePath, ext);
        const dir = path.dirname(basePath);
        return path.join(dir, `${name}_${stepIndex}${ext}`);
    }
}
