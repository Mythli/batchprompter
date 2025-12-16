import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import util from 'util';
import { exec } from 'child_process';
import { z } from 'zod';
import fsPromises from 'fs/promises';

import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { ArtifactSaver } from '../ArtifactSaver.js';
import { StepConfig } from '../types.js';
import { aggressiveSanitize, ensureDir } from '../utils/fileUtils.js';
import { MessageBuilder } from '../core/MessageBuilder.js';
import { BoundLlmClient } from '../core/BoundLlmClient.js';

const execPromise = util.promisify(exec);

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
                data: z.string(),
                expires_at: z.number(),
                transcript: z.string().optional()
            }).optional()
        })
    })).min(1)
});

type ExtractedContent = {
    type: 'text' | 'image' | 'audio';
    data: string;
    extension: string;
    raw?: any;
};

export class StandardStrategy implements GenerationStrategy {
    constructor(
        private llm: BoundLlmClient,
        private messageBuilder: MessageBuilder
    ) {}

    private extractContent(message: z.infer<typeof responseSchema>['choices'][0]['message']): ExtractedContent {
        if (message.audio) {
            return { type: 'audio', data: message.audio.data, extension: 'wav' };
        }
        if (message.images && message.images.length > 0) {
            return { type: 'image', data: message.images[0].image_url.url, extension: 'png' };
        }

        if (typeof message.content === 'string') {
            return { type: 'text', data: message.content, extension: 'md' };
        }

        return { type: 'text', data: '', extension: 'md' };
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

        if (validated.type === 'text' && config.jsonSchema) {
            try {
                const data = JSON.parse(validated.data);
                validated.data = JSON.stringify(data, null, 2);
                if (validated.raw === undefined) {
                    validated.raw = data;
                }
            } catch (e: any) {
                if (e.message.includes('JSON')) throw e;
                throw new Error(`Invalid JSON: ${e.message}`);
            }
        }

        if (config.verifyCommand && !skipCommands) {
            let tempPath: string;

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
        skipCommands: boolean = false,
        variationIndex?: number
    ): Promise<GenerationResult> {

        const effectiveOutputPath = outputPathOverride || config.outputPath;

        const totalIterations = 1 + (config.feedbackLoops || 0);
        let finalContent: ExtractedContent | null = null;

        const currentHistory = [...history];

        for (let loop = 0; loop < totalIterations; loop++) {
            const isFeedbackLoop = loop > 0;

            if (isFeedbackLoop) {
                console.log(`[Row ${index}] Step ${stepIndex} 🔄 Feedback Loop ${loop}/${config.feedbackLoops}`);

                if (config.feedback) {
                    console.warn("Feedback loops require the feedback client which is not yet passed to StandardStrategy in this refactor.");
                }
            }

            finalContent = await this.generateWithRetry(
                currentHistory,
                config,
                row,
                index,
                stepIndex,
                skipCommands,
                userPromptParts,
                cacheSalt
            );
        }

        if (!finalContent) throw new Error("Generation failed.");

        if (effectiveOutputPath && (!config.verifyCommand || skipCommands)) {
            await this.saveArtifact(finalContent, effectiveOutputPath);
            console.log(`[Row ${index}] Step ${stepIndex} Saved ${finalContent.type} to ${effectiveOutputPath}`);
        }

        if (config.postProcessCommand && !skipCommands) {
            let filePathForCommand = effectiveOutputPath;
            let isTemp = false;

            if (!filePathForCommand) {
                isTemp = true;

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
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        config: StepConfig,
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        skipCommands: boolean,
        userPromptParts?: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        cacheSalt?: string | number
    ): Promise<ExtractedContent> {
        const maxRetries = 3;
        let currentHistory = [...history];
        let lastError: any;

        // Build request options with cache salt header if provided
        const requestOptions = cacheSalt ? {
            headers: { 'X-Cache-Salt': String(cacheSalt) }
        } : undefined;

        // Build additional model parameters (e.g., for image generation)
        const additionalParams: Record<string, any> = {};
        if (config.aspectRatio) {
            additionalParams.aspect_ratio = config.aspectRatio;
        }

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                let extracted: ExtractedContent;

                // Build messages using MessageBuilder
                const messages = this.messageBuilder.build(config.modelConfig, row, userPromptParts);
                
                // Merge with history
                const finalMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
                const systemMsg = messages.find(m => m.role === 'system');
                if (systemMsg) {
                    finalMessages.push(systemMsg);
                }
                finalMessages.push(...currentHistory);
                const userMsgs = messages.filter(m => m.role !== 'system');
                finalMessages.push(...userMsgs);

                if (config.jsonSchema) {
                    const rawClient = this.llm.getRawClient();
                    // Pass cache salt as third argument (options) to promptJson
                    const jsonResult = await rawClient.promptJson(
                        finalMessages,
                        config.jsonSchema,
                        requestOptions ? { requestOptions, ...additionalParams } : (Object.keys(additionalParams).length > 0 ? additionalParams : undefined)
                    );

                    extracted = {
                        type: 'text',
                        data: JSON.stringify(jsonResult, null, 2),
                        extension: 'json',
                        raw: jsonResult
                    };
                } else {
                    const response = await this.llm.prompt({
                        messages: finalMessages,
                        requestOptions,
                        ...additionalParams
                    });

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
                    currentHistory.push({
                        role: 'user',
                        content: `The previous generation failed with the following error:\n${error.message}\n\nPlease try again and fix the issue.`
                    });
                }
            }
        }
        throw new Error(`Generation failed after ${maxRetries + 1} attempts. Last error: ${lastError?.message}`);
    }
}
