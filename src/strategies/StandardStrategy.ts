// 
import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import util from 'util';
import { exec } from 'child_process';
import { z } from 'zod';
import fsPromises from 'fs/promises';

import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { ArtifactSaver } from '../ArtifactSaver.js';
import { StepConfig } from '../types.js'; // Updated import
import { LlmClient } from "llm-fns";
import { aggressiveSanitize, ensureDir } from '../utils/fileUtils.js';
import { ModelRequestNormalizer } from '../core/ModelRequestNormalizer.js';

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
    raw?: any;
};

export class StandardStrategy implements GenerationStrategy {
    constructor(
        private llm: LlmClient,
        private model: string | undefined // Kept for compatibility, but config.model is preferred
    ) {}

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
        config: StepConfig,
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
                // Ensure raw is set if it wasn't already (e.g. if we parsed it here)
                if (validated.raw === undefined) {
                    validated.raw = data;
                }
            } catch (e: any) {
                if (e.message.includes('JSON')) throw e;
                throw new Error(`Invalid JSON: ${e.message}`);
            }
        }

        // 2. Verify Command (Universal)
        if (config.verifyCommand && !skipCommands) {
            // Create temp file
            let tempPath: string;
            
            // Use resolvedTempDir if available, otherwise global tmpDir
            const baseTempDir = config.resolvedTempDir || config.tmpDir;
            const verifyDir = path.join(baseTempDir, 'verify');
            await ensureDir(verifyDir);

            if (config.outputPath) {
                const ext = path.extname(config.outputPath);
                const name = path.basename(config.outputPath, ext);
                const timestamp = Date.now();
                const random = Math.random().toString(36).substring(7);
                
                tempPath = path.join(verifyDir, `${name}_verify_${timestamp}_${random}.${validated.extension}`);
            } else {
                const tempFilename = `verify_${index}_${stepIndex}_${Date.now()}_${Math.random().toString(36).substring(7)}.${validated.extension}`;
                tempPath = path.join(verifyDir, tempFilename);
            }

            try {
                await this.saveArtifact(validated, tempPath);

                const cmdTemplate = Handlebars.compile(config.verifyCommand, { noEscape: true });
                
                // Sanitize row data
                const sanitizedRow: Record<string, string> = {};
                for (const [key, val] of Object.entries(row)) {
                    const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
                    sanitizedRow[key] = aggressiveSanitize(stringVal);
                }

                const cmd = cmdTemplate({ ...sanitizedRow, file: tempPath });

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
            const buffer = Buffer.from(content.data, 'base64');
            await ArtifactSaver.save(buffer, targetPath);
        } else {
            await ArtifactSaver.save(content.data, targetPath);
        }
    }

    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: StepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        cacheSalt?: string | number,
        outputPathOverride?: string,
        skipCommands: boolean = false
    ): Promise<GenerationResult> {

        const effectiveOutputPath = outputPathOverride || config.outputPath;

        // --- Main Generation Loop (Initial + Feedback) ---
        const totalIterations = 1 + (config.feedbackLoops || 0);
        let finalContent: ExtractedContent | null = null;

        // Initial History
        // We construct the base request using Normalizer
        // This handles System Prompt, User Prompt (from config + positional), and Thinking Level
        
        // FIX: Prevent prompt duplication.
        // userPromptParts already contains the prompt (merged in ActionRunner/StepExecutor).
        // We strip it from the config passed to normalizer so it's not added again.
        const configForNormalizer = {
            ...config.modelConfig,
            promptParts: []
        };

        const baseRequest = ModelRequestNormalizer.normalize(configForNormalizer, row, userPromptParts);
        
        // We need to merge the persistent history passed in
        const currentMessages = [...baseRequest.messages];
        // Insert persistent history after system prompt (if any)
        const systemIndex = currentMessages.findIndex(m => m.role === 'system');
        if (systemIndex >= 0) {
            currentMessages.splice(systemIndex + 1, 0, ...history);
        } else {
            currentMessages.unshift(...history);
        }

        for (let loop = 0; loop < totalIterations; loop++) {
            const isFeedbackLoop = loop > 0;

            if (isFeedbackLoop) {
                console.log(`[Row ${index}] Step ${stepIndex} 🔄 Feedback Loop ${loop}/${config.feedbackLoops}`);

                // Save previous iteration draft
                if (finalContent) {
                    // ... (Save draft logic same as before) ...
                }

                // Generate Critique
                // Use the Feedback Model Config
                if (config.feedback) {
                    const critique = await this.generateCritique(
                        finalContent!,
                        config.feedback, // Pass the sub-config
                        row,
                        currentMessages,
                        `${cacheSalt}_critique_${loop-1}`
                    );
                    console.log(`[Row ${index}] Step ${stepIndex} 📝 Critique: ${critique}`);

                    // Append to history
                    if (finalContent!.type === 'text') {
                        currentMessages.push({ role: 'assistant', content: finalContent!.data });
                    } else if (finalContent!.type === 'image') {
                        currentMessages.push({ role: 'assistant', content: "[Generated Image]" });
                        currentMessages.push({ role: 'user', content: [ { type: 'image_url', image_url: { url: finalContent!.data } } ] });
                    }
                    currentMessages.push({ role: 'user', content: `Critique:\n${critique}\n\nPlease regenerate the content to address this critique.` });
                }
            }

            // Generate with Technical Retries
            const loopSalt = isFeedbackLoop ? `${cacheSalt}_refine_${loop-1}` : cacheSalt;
            
            // Update request messages
            baseRequest.messages = currentMessages;
            
            finalContent = await this.generateWithRetry(
                baseRequest, // Pass the normalized request object
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
            // ... (Post process logic same as before) ...
            let filePathForCommand = effectiveOutputPath;
            let isTemp = false;

            if (!filePathForCommand) {
                isTemp = true;
                
                // Use resolvedTempDir if available, otherwise global tmpDir
                const baseTempDir = config.resolvedTempDir || config.tmpDir;
                const postDir = path.join(baseTempDir, 'postprocess');
                await ensureDir(postDir);

                if (config.outputPath) {
                    const ext = path.extname(config.outputPath);
                    const name = path.basename(config.outputPath, ext);
                    filePathForCommand = path.join(postDir, `${name}_temp_post.${finalContent.extension}`);
                } else {
                    filePathForCommand = path.join(postDir, `temp_post_${index}_${stepIndex}.${finalContent.extension}`);
                }
                await this.saveArtifact(finalContent, filePathForCommand);
            }

            const cmdTemplate = Handlebars.compile(config.postProcessCommand, { noEscape: true });
            const sanitizedRow: Record<string, string> = {};
            for (const [key, val] of Object.entries(row)) {
                const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
                sanitizedRow[key] = aggressiveSanitize(stringVal);
            }
            const cmd = cmdTemplate({ ...sanitizedRow, file: filePathForCommand });
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
            columnValue: finalContent.data,
            raw: finalContent.raw
        };
    }

    private async generateWithRetry(
        request: { model: string, messages: any[], options: any },
        config: StepConfig,
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        skipCommands: boolean,
        salt?: string | number
    ): Promise<ExtractedContent> {
        const maxRetries = 3;
        let currentMessages = [...request.messages];
        let lastError: any;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                let extracted: ExtractedContent;

                // BRANCH 1: Strict JSON Schema Mode (using llm.promptJson)
                if (config.jsonSchema) {
                    const jsonResult = await this.llm.promptJson(
                        currentMessages,
                        config.jsonSchema,
                        {
                            model: request.model,
                            ...request.options,
                            cacheSalt: attempt === 0 ? salt : `${salt}_retry_${attempt}`,
                            maxRetries: 3 // Allow internal retries for JSON syntax fixing
                        }
                    );

                    extracted = {
                        type: 'text',
                        data: JSON.stringify(jsonResult, null, 2),
                        extension: 'json',
                        raw: jsonResult
                    };
                } 
                // BRANCH 2: Standard Text/Image/Audio Mode
                else {
                    const promptOptions: any = {
                        messages: currentMessages,
                        model: request.model,
                        ...request.options, // Include thinking level etc
                        cacheSalt: attempt === 0 ? salt : `${salt}_retry_${attempt}`,
                    };

                    // Configure Modalities
                    if (config.aspectRatio) {
                        promptOptions.modalities = ['image', 'text'];
                        promptOptions.image_config = { aspect_ratio: config.aspectRatio };
                    }

                    const response = await this.llm.prompt(promptOptions);
                    const parsed = responseSchema.parse(response);
                    const message = parsed.choices[0].message;

                    extracted = this.extractContent(message);
                }

                const validated = await this.validateContent(extracted, config, row, index, stepIndex, skipCommands);

                return validated;

            } catch (error: any) {
                lastError = error;
                console.log(`[Row ${index}] Step ${stepIndex} Attempt ${attempt+1}/${maxRetries+1} failed: ${error.message}`);

                if (attempt < maxRetries) {
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
        feedbackConfig: any, // ResolvedModelConfig
        row: Record<string, any>,
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        salt: string
    ): Promise<string> {
        
        // Use Normalizer to build the critique request
        // The "User Prompt" for the critique is the content to be critiqued
        
        const critiqueContentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        
        if (content.type === 'image') {
            critiqueContentParts.push({ type: 'text', text: "\nAnalyze the image below:" });
            critiqueContentParts.push({ type: 'image_url', image_url: { url: content.data } });
        } else if (content.type === 'text') {
            critiqueContentParts.push({ type: 'text', text: `\nCurrent Draft:\n${content.data}` });
        } else if (content.type === 'audio') {
             critiqueContentParts.push({ type: 'text', text: "\nAnalyze the audio below:" });
             critiqueContentParts.push({ type: 'input_audio', input_audio: { data: content.data, format: 'wav' } });
        }

        // Normalize the feedback request
        // We pass the critique content as "externalContent"
        const request = ModelRequestNormalizer.normalize(feedbackConfig, row, critiqueContentParts);

        // We need to inject the conversation history into the critique request so the critic knows context
        // Insert history after system prompt
        const systemIndex = request.messages.findIndex(m => m.role === 'system');
        const historyNoSystem = history.filter(m => m.role !== 'system');
        
        if (systemIndex >= 0) {
            request.messages.splice(systemIndex + 1, 0, ...historyNoSystem);
        } else {
            request.messages.unshift(...historyNoSystem);
        }

        const response = await this.llm.prompt({
            messages: request.messages,
            model: request.model,
            ...request.options,
            cacheSalt: salt
        } as any);

        return response.choices[0].message.content || "No critique provided.";
    }
}
