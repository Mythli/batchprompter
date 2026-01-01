import OpenAI from 'openai';
import { z } from 'zod';
import path from 'path';
import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { StepConfig } from '../types.js';
import { MessageBuilder } from '../core/MessageBuilder.js';
import { BoundLlmClient } from '../core/BoundLlmClient.js';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from '../core/events.js';

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
        private messageBuilder: MessageBuilder,
        private events: EventEmitter<BatchPromptEvents>
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
        stepIndex: number
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

        // Verification via Handler
        if (config.handlers?.verify) {
            this.events.emit('log', { level: 'info', message: `[Row ${index}] Step ${stepIndex} 🔍 Verifying content...` });
            
            const result = await config.handlers.verify(validated.data, {
                row,
                workspace: {}, // TODO: Pass full context if needed
                stepIndex,
                rowIndex: index,
                history: []
            });

            if (!result.isValid) {
                throw new Error(`Verification failed:\n${result.feedback || 'No feedback provided.'}\n\nPlease fix the content.`);
            }
            
            this.events.emit('log', { level: 'info', message: `[Row ${index}] Step ${stepIndex} 🟢 Verification passed.` });
        }

        return validated;
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

        const totalIterations = 1 + (config.feedbackLoops || 0);
        let finalContent: ExtractedContent | null = null;

        const currentHistory = [...history];

        for (let loop = 0; loop < totalIterations; loop++) {
            const isFeedbackLoop = loop > 0;

            if (isFeedbackLoop) {
                this.events.emit('log', { level: 'info', message: `[Row ${index}] Step ${stepIndex} 🔄 Feedback Loop ${loop}/${config.feedbackLoops}` });
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

        // Emit Artifact
        const effectiveBasename = config.outputBasename || 'output';
        let filename = `${effectiveBasename}.${finalContent.extension}`;
        
        // If variation index is present, append it
        if (variationIndex !== undefined) {
            filename = `${effectiveBasename}_${variationIndex}.${finalContent.extension}`;
        }

        // --- FIX: Use resolvedTempDir to make path absolute ---
        if (config.resolvedTempDir) {
            filename = path.join(config.resolvedTempDir, filename);
        }

        let contentPayload: string | Buffer = finalContent.data;
        if (finalContent.type === 'audio') {
            contentPayload = Buffer.from(finalContent.data, 'base64');
        }

        this.events.emit('artifact', {
            row: index,
            step: stepIndex,
            type: finalContent.type,
            filename: filename,
            content: contentPayload,
            tags: ['final']
        });

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

        const requestOptions = cacheSalt ? {
            headers: { 'X-Cache-Salt': String(cacheSalt) }
        } : undefined;

        const additionalParams: Record<string, any> = {};
        if (config.aspectRatio) {
             additionalParams.image_config = { aspect_ratio: config.aspectRatio };
        }

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                let extracted: ExtractedContent;

                const messages = this.messageBuilder.build(config.modelConfig, row, userPromptParts);

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

                const validated = await this.validateContent(extracted, config, row, index, stepIndex);

                return validated;

            } catch (error: any) {
                lastError = error;
                this.events.emit('log', { level: 'warn', message: `[Row ${index}] Step ${stepIndex} Attempt ${attempt+1}/${maxRetries+1} failed: ${error.message}` });

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
