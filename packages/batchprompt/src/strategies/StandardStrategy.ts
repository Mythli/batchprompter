import OpenAI from 'openai';
import { z } from 'zod';
import path from 'path';
import { completionToMessage } from 'llm-fns';
import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { StepConfig } from '../types.js';
import { MessageBuilder } from '../core/MessageBuilder.js';
import { BoundLlmClient } from '../core/BoundLlmClient.js';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from '../core/events.js';

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

    private extractContent(message: OpenAI.Chat.Completions.ChatCompletionMessageParam): ExtractedContent {
        const content = message.content;

        if (typeof content === 'string') {
            return { type: 'text', data: content, extension: 'md' };
        }

        if (Array.isArray(content)) {
            const audio = content.find(p => p.type === 'input_audio');
            if (audio && audio.type === 'input_audio') {
                return { type: 'audio', data: audio.input_audio.data, extension: 'wav' };
            }

            const image = content.find(p => p.type === 'image_url');
            if (image && image.type === 'image_url') {
                return { type: 'image', data: image.image_url.url, extension: 'png' };
            }

            // Fallback to text parts
            const text = content
                .filter(p => p.type === 'text')
                .map(p => p.text)
                .join('\n');
            
            return { type: 'text', data: text, extension: 'md' };
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
            this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `🔍 Verifying content...` });

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

            this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `🟢 Verification passed.` });
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
        let finalHistoryMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam | null = null;
        let finalRaw: any = undefined;

        const currentHistory = [...history];

        for (let loop = 0; loop < totalIterations; loop++) {
            const isFeedbackLoop = loop > 0;

            if (isFeedbackLoop) {
                this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `🔄 Feedback Loop ${loop}/${config.feedbackLoops}` });
            }

            const result = await this.generate(
                currentHistory,
                config,
                row,
                index,
                stepIndex,
                skipCommands,
                userPromptParts,
                cacheSalt
            );

            finalContent = result.extracted;
            finalHistoryMessage = result.historyMessage;
            finalRaw = result.extracted.raw;

            // If feedback loops are active, we need to update history for the next iteration
            if (isFeedbackLoop || totalIterations > 1) {
                currentHistory.push(finalHistoryMessage);
                // TODO: Add feedback prompt from judge/feedback model here if we want true feedback loop
                // Currently StandardStrategy just retries generation without new feedback unless implemented elsewhere
            }
        }

        if (!finalContent || !finalHistoryMessage) throw new Error("Generation failed.");

        // Emit Artifact
        const effectiveBasename = config.outputBasename || 'output';
        let filename = `${effectiveBasename}.${finalContent.extension}`;

        // If variation index is present, append it
        if (variationIndex !== undefined) {
            filename = `${effectiveBasename}_${variationIndex}.${finalContent.extension}`;
        }

        // Use resolvedOutputDir if available (explicit user output), otherwise temp dir
        const targetDir = config.resolvedOutputDir || config.resolvedTempDir;
        if (targetDir) {
            filename = path.join(targetDir, filename);
        }

        let contentPayload: string | Buffer = finalContent.data;
        if (finalContent.type === 'audio') {
            contentPayload = Buffer.from(finalContent.data, 'base64');
        }

        this.events.emit('plugin:artifact', {
            row: index,
            step: stepIndex,
            plugin: 'model',
            type: finalContent.type,
            filename: filename,
            content: contentPayload,
            tags: ['final']
        });

        return {
            historyMessage: finalHistoryMessage,
            columnValue: finalContent.data,
            raw: finalRaw
        };
    }

    private async generate(
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        config: StepConfig,
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        skipCommands: boolean,
        userPromptParts?: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        cacheSalt?: string | number
    ): Promise<{ extracted: ExtractedContent, historyMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam }> {
        const requestOptions = cacheSalt ? {
            headers: { 'X-Cache-Salt': String(cacheSalt) }
        } : undefined;

        const additionalParams: Record<string, any> = {};
        if (config.aspectRatio) {
             additionalParams.image_config = { aspect_ratio: config.aspectRatio };
        }

        let extracted: ExtractedContent;
        let historyMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam;

        const messages = this.messageBuilder.build(config.modelConfig, row, userPromptParts);

        const finalMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
        const systemMsg = messages.find(m => m.role === 'system');
        if (systemMsg) {
            finalMessages.push(systemMsg);
        }
        finalMessages.push(...history);
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
            
            // For JSON, we construct a text message
            historyMessage = { role: 'assistant', content: extracted.data };

        } else {
            const response = await this.llm.prompt({
                messages: finalMessages,
                requestOptions,
                ...additionalParams
            });

            // Normalize the response to a message
            historyMessage = completionToMessage(response);
            
            // Extract content for validation and saving
            extracted = this.extractContent(historyMessage);
        }

        const validated = await this.validateContent(extracted, config, row, index, stepIndex);

        return { extracted: validated, historyMessage };
    }
}
