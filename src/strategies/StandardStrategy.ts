import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import util from 'util';
import { exec } from 'child_process';
import { z } from 'zod';
import fsPromises from 'fs/promises';
import { LlmClient } from 'llm-fns';

import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { ArtifactSaver } from '../ArtifactSaver.js';
import { ResolvedStepConfig } from '../StepConfigurator.js';
import { ImageSearchTool } from '../utils/ImageSearchTool.js';

const execPromise = util.promisify(exec);

// Unified Response Schema supporting Text, Image, and Audio
const responseSchema = z.object({
    choices: z.array(z.object({
        message: z.object({
            content: z.string().nullable().optional(),
            images: z.array(z.object({
                image_url: z.object({
                    url: z.string()
                })
            })).optional(),
            audio: z.object({
                id: z.string(),
                data: z.string(), // Base64 encoded audio data
                expires_at: z.number(),
                transcript: z.string().optional()
            }).optional()
        })
    })).min(1)
});

type ExtractedContent = {
    type: 'text' | 'image' | 'audio';
    data: string; // Text content, Image URL, or Audio Base64
    extension: string;
};

export class StandardStrategy implements GenerationStrategy {
    constructor(
        private llm: LlmClient,
        private model: string | undefined,
        private imageSearchTool?: ImageSearchTool
    ) {}

    private extractUserText(parts: OpenAI.Chat.Completions.ChatCompletionContentPart[]): string {
        return parts.map(p => {
            if (p.type === 'text') return p.text;
            return `[${p.type} Input]`;
        }).join('\n');
    }

    private extractContent(message: z.infer<typeof responseSchema>['choices'][0]['message']): ExtractedContent {
        if (message.audio) {
            return { type: 'audio', data: message.audio.data, extension: 'wav' };
        }
        if (message.images && message.images.length > 0) {
            return { type: 'image', data: message.images[0].image_url.url, extension: 'png' };
        }
        if (message.content) {
            return { type: 'text', data: message.content, extension: 'txt' };
        }
        throw new Error("LLM returned empty response (no text, image, or audio).");
    }

    private async validateContent(
        extracted: ExtractedContent,
        config: ResolvedStepConfig,
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        skipCommands: boolean
    ): Promise<ExtractedContent> {
        let validated = { ...extracted };

        // 1. JSON Schema Validation (Text only)
        if (validated.type === 'text' && config.jsonSchema) {
            try {
                const data = JSON.parse(validated.data);
                // Re-serialize to ensure clean formatting
                validated.data = JSON.stringify(data, null, 2);

                if (config.validator) {
                    const valid = config.validator(data);
                    if (!valid) {
                        const errors = config.validator.errors?.map((e: any) => `${e.instancePath} ${e.message}`).join(', ');
                        throw new Error(`JSON does not match schema: ${errors}`);
                    }
                }
            } catch (e: any) {
                if (e.message.includes('JSON')) throw e;
                throw new Error(`Invalid JSON: ${e.message}`);
            }
        }

        // 2. Verify Command (Universal)
        if (config.verifyCommand && !skipCommands) {
            // Create temp file
            const tempFilename = `temp_verify_${index}_${stepIndex}_${Date.now()}_${Math.random().toString(36).substring(7)}.${validated.extension}`;
            const tempPath = path.join(process.cwd(), tempFilename);

            try {
                await this.saveArtifact(validated, tempPath);

                const cmdTemplate = Handlebars.compile(config.verifyCommand, { noEscape: true });
                const cmd = cmdTemplate({ ...row, file: tempPath });

                console.log(`[Row ${index}] Step ${stepIndex} 🔍 Verifying: ${cmd}`);

                const { stdout } = await execPromise(cmd);
                if (stdout && stdout.trim()) console.log(`[Row ${index}] Step ${stepIndex} 🟢 Verify STDOUT:\n${stdout.trim()}`);

            } catch (error: any) {
                const feedback = error.stderr || error.stdout || error.message;
                throw new Error(`Verification command failed:\n${feedback}\n\nPlease fix the content.`);
            } finally {
                try { await fsPromises.unlink(tempPath); } catch (e) {}
            }
        }

        return validated;
    }

    private async saveArtifact(content: ExtractedContent, targetPath: string) {
        if (content.type === 'audio') {
            // Base64 to Buffer
            const buffer = Buffer.from(content.data, 'base64');
            await ArtifactSaver.save(buffer, targetPath);
        } else {
            // Text or Image URL
            await ArtifactSaver.save(content.data, targetPath);
        }
    }

    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: ResolvedStepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        cacheSalt?: string | number,
        outputPathOverride?: string,
        skipCommands: boolean = false
    ): Promise<GenerationResult> {

        const effectiveOutputPath = outputPathOverride || config.outputPath;

        // --- Image Search Integration ---
        let searchContentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        if (this.imageSearchTool && (config.imageSearchQuery || config.imageSearchPrompt)) {
            try {
                const searchResult = await this.imageSearchTool.execute(row, index, stepIndex, config, cacheSalt);
                searchContentParts = searchResult.contentParts;
            } catch (e: any) {
                console.error(`[Row ${index}] Step ${stepIndex} Image Search failed:`, e.message);
                // We continue without images if search fails, or we could throw. 
                // Let's log and continue to be robust.
            }
        }

        // Initial History
        let currentHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

        // System Prompt
        if (config.systemPrompt || config.jsonSchema) {
            let content = config.systemPrompt || "";
            if (config.jsonSchema) {
                if (content) content += "\n\n";
                content += `You must output valid JSON that matches the following schema: ${JSON.stringify(config.jsonSchema)}`;
            }
            currentHistory.push({ role: 'system', content });
        }

        currentHistory.push(...history);
        
        // Combine Search Results + User Prompt
        // Search results go BEFORE the user prompt so the user prompt is the final instruction
        const combinedUserContent = [...searchContentParts, ...userPromptParts];
        currentHistory.push({ role: 'user', content: combinedUserContent });

        let finalContent: ExtractedContent | null = null;

        // --- Main Generation Loop (Initial + Feedback) ---
        const totalIterations = 1 + (config.feedbackLoops || 0);

        for (let loop = 0; loop < totalIterations; loop++) {
            const isFeedbackLoop = loop > 0;

            if (isFeedbackLoop) {
                console.log(`[Row ${index}] Step ${stepIndex} 🔄 Feedback Loop ${loop}/${config.feedbackLoops}`);

                // Generate Critique
                // Pass currentHistory to allow the critic to see the conversation context
                const critique = await this.generateCritique(
                    finalContent!,
                    config,
                    userPromptParts,
                    currentHistory,
                    `${cacheSalt}_critique_${loop-1}`
                );
                console.log(`[Row ${index}] Step ${stepIndex} 📝 Critique: ${critique}`);

                // Append to history
                // 1. Assistant's previous attempt
                if (finalContent!.type === 'text') {
                    currentHistory.push({ role: 'assistant', content: finalContent!.data });
                } else if (finalContent!.type === 'image') {
                    // Store actual image in history so both Generator and Critic can see it in future turns
                    // Assistant messages cannot contain images, so we use a placeholder text for the assistant
                    // and inject the image as a user message immediately after.
                    currentHistory.push({
                        role: 'assistant',
                        content: "[Generated Image]"
                    });
                    currentHistory.push({
                        role: 'user',
                        content: [ { type: 'image_url', image_url: { url: finalContent!.data } } ]
                    });
                } else {
                    // For Audio, we represent it abstractly in history if we can't feed it back directly
                    currentHistory.push({ role: 'assistant', content: `[Generated ${finalContent!.type}]` });
                }

                // 2. User's Critique
                currentHistory.push({ role: 'user', content: `Critique:\n${critique}\n\nPlease regenerate the content to address this critique.` });
            }

            // Generate with Technical Retries
            const loopSalt = isFeedbackLoop ? `${cacheSalt}_refine_${loop-1}` : cacheSalt;
            finalContent = await this.generateWithRetry(
                currentHistory,
                config,
                row,
                index,
                stepIndex,
                skipCommands,
                loopSalt
            );
        }

        if (!finalContent) throw new Error("Generation failed.");

        // Save Final Output
        if (effectiveOutputPath && (!config.verifyCommand || skipCommands)) {
            await this.saveArtifact(finalContent, effectiveOutputPath);
            console.log(`[Row ${index}] Step ${stepIndex} Saved ${finalContent.type} to ${effectiveOutputPath}`);
        }

        // Post Process Command
        if (config.postProcessCommand && !skipCommands) {
            let filePathForCommand = effectiveOutputPath;
            let isTemp = false;

            if (!filePathForCommand) {
                isTemp = true;
                filePathForCommand = path.join(process.cwd(), `temp_post_${index}_${stepIndex}.${finalContent.extension}`);
                await this.saveArtifact(finalContent, filePathForCommand);
            }

            const cmdTemplate = Handlebars.compile(config.postProcessCommand, { noEscape: true });
            const cmd = cmdTemplate({ ...row, file: filePathForCommand });

            console.log(`[Row ${index}] Step ${stepIndex} ⚙️ Running command: ${cmd}`);

            try {
                const { stdout } = await execPromise(cmd);
                if (stdout && stdout.trim()) console.log(`[Row ${index}] Step ${stepIndex} STDOUT:\n${stdout.trim()}`);
            } catch (error: any) {
                console.error(`[Row ${index}] Step ${stepIndex} Command failed:`, error.message);
            }

            if (isTemp) {
                try { await fsPromises.unlink(filePathForCommand!); } catch (e) {}
            }
        }

        return {
            historyMessage: {
                role: 'assistant',
                content: finalContent.type === 'text' ? finalContent.data : `[Generated ${finalContent.type}]`
            },
            columnValue: finalContent.data // URL, Base64, or Text
        };
    }

    private async generateWithRetry(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        config: ResolvedStepConfig,
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        skipCommands: boolean,
        salt?: string | number
    ): Promise<ExtractedContent> {
        const maxRetries = 3;
        let currentMessages = [...messages];
        let lastError: any;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const promptOptions: any = {
                    messages: currentMessages,
                    model: this.model,
                    cacheSalt: attempt === 0 ? salt : `${salt}_retry_${attempt}`,
                };

                // Configure Modalities
                if (config.aspectRatio) {
                    promptOptions.modalities = ['image', 'text'];
                    promptOptions.image_config = { aspect_ratio: config.aspectRatio };
                }
                // Future: Audio config check here (e.g. if config.audioFormat)

                if (config.jsonSchema) {
                    promptOptions.response_format = { type: "json_object" };
                }

                const response = await this.llm.prompt(promptOptions);
                const parsed = responseSchema.parse(response);
                const message = parsed.choices[0].message;

                const extracted = this.extractContent(message);
                const validated = await this.validateContent(extracted, config, row, index, stepIndex, skipCommands);

                return validated;

            } catch (error: any) {
                lastError = error;
                console.log(`[Row ${index}] Step ${stepIndex} Attempt ${attempt+1}/${maxRetries+1} failed: ${error.message}`);

                if (attempt < maxRetries) {
                    // Add error to history for retry
                    currentMessages.push({
                        role: 'user',
                        content: `The previous generation failed with the following error:\n${error.message}\n\nPlease try again and fix the issue.`
                    });
                }
            }
        }
        throw new Error(`Generation failed after ${maxRetries + 1} attempts. Last error: ${lastError?.message}`);
    }

    private async generateCritique(
        content: ExtractedContent,
        config: ResolvedStepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        salt: string
    ): Promise<string> {
        // 1. Construct the Critique Request (The "User" message for the Critic)
        const critiqueRequestContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            { type: 'text', text: `Critique Criteria:` },
            ...(config.feedbackPrompt || [])
        ];

        // Attach content to critique prompt
        if (content.type === 'image') {
            critiqueRequestContent.push({ type: 'text', text: "\nAnalyze the image below:" });
            critiqueRequestContent.push({ type: 'image_url', image_url: { url: content.data } });
        } else if (content.type === 'text') {
            critiqueRequestContent.push({ type: 'text', text: `\nCurrent Draft:\n${content.data}` });
        } else if (content.type === 'audio') {
             critiqueRequestContent.push({ type: 'text', text: "\nAnalyze the audio below:" });
             critiqueRequestContent.push({
                 type: 'input_audio',
                 input_audio: { data: content.data, format: 'wav' }
             });
        }

        // 2. Construct the Full History for the Critic
        // We filter out 'system' messages from the generator's history to avoid confusing the Critic with the Generator's instructions.
        const conversationContext = history.filter(m => m.role !== 'system');

        const critiqueMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            {
                role: 'system',
                content: 'You are an expert critic. Review the conversation history to understand the context and previous feedback. Analyze the provided content against the criteria and provide specific, actionable improvements.'
            },
            ...conversationContext,
            { role: 'user', content: critiqueRequestContent }
        ];

        const response = await this.llm.prompt({
            messages: critiqueMessages,
            model: config.feedbackModel || this.model,
            cacheSalt: salt
        });

        return response.choices[0].message.content || "No critique provided.";
    }
}
