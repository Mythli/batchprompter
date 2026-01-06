import OpenAI from 'openai';
import path from 'path';
import Ajv from 'ajv';
import { completionToMessage, LlmRetryError, LlmRetryResponseInfo, SchemaValidationError, concatMessageText } from 'llm-fns';
import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { StepConfig } from '../types.js';
import { BoundLlmClient } from '../core/BoundLlmClient.js';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from '../core/events.js';
import { Plugin, PluginExecutionContext, PluginServices } from '../plugins/types.js';
import { ResolvedPluginBase } from '../config/types.js';

type ExtractedContent = {
    type: 'text' | 'image' | 'audio';
    data: string;
    extension: string;
    raw?: any;
};

export class StandardStrategy implements GenerationStrategy {
    private ajv: any;

    constructor(
        private llm: BoundLlmClient,
        private events: EventEmitter<BatchPromptEvents>,
        private plugins: { instance: Plugin; config: any; def: ResolvedPluginBase }[],
        private pluginServices: PluginServices,
        private tempDir: string
    ) {
        // @ts-ignore
        this.ajv = new Ajv.default ? new Ajv.default({ strict: false }) : new Ajv({ strict: false });
    }

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
            const text = concatMessageText([message]);
            
            return { type: 'text', data: text, extension: 'md' };
        }

        return { type: 'text', data: '', extension: 'md' };
    }

    private createPluginContext(row: Record<string, any>, stepIndex: number, pluginIndex: number, index: number): PluginExecutionContext {
        return {
            row,
            stepIndex,
            pluginIndex,
            services: this.pluginServices,
            tempDirectory: this.tempDir,
            emit: (event, ...args) => {
                if (event === 'plugin:artifact') {
                    const payload = args[0];
                    if (payload && payload.filename && !path.isAbsolute(payload.filename) && !payload.filename.startsWith('out')) {
                        payload.filename = path.join(this.tempDir, payload.filename);
                    }
                    this.events.emit('plugin:artifact', payload);
                } else if (event === 'step:progress') {
                    const payload = args[0];
                    this.events.emit('step:progress', { row: index, step: stepIndex, ...payload });
                } else {
                    (this.events.emit as any)(event, ...args);
                }
            }
        };
    }

    private async runPostProcessingPhase(
        initialData: any,
        conversation: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        row: Record<string, any>,
        index: number,
        stepIndex: number
    ): Promise<any> {
        let currentData = initialData;

        for (let i = 0; i < this.plugins.length; i++) {
            const { instance, config: pluginConfig } = this.plugins[i];
            if (instance.postProcessMessages) {
                const context = this.createPluginContext(row, stepIndex, i, index);
                try {
                    currentData = await instance.postProcessMessages(currentData, conversation, pluginConfig, context);
                } catch (e: any) {
                    throw new LlmRetryError(e.message, 'CUSTOM_ERROR', undefined, typeof currentData === 'string' ? currentData : JSON.stringify(currentData));
                }
            }
        }

        return currentData;
    }

    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: StepConfig,
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        cacheSalt?: string | number,
        outputPathOverride?: string,
        skipCommands: boolean = false,
        variationIndex?: number
    ): Promise<GenerationResult> {

        // 1. Messages are now passed in (already prepared by PluginExecutor)
        const finalMessages = messages;

        // 2. Generation Loop
        const requestOptions = cacheSalt ? {
            headers: { 'X-Cache-Salt': String(cacheSalt) }
        } : undefined;

        const additionalParams: Record<string, any> = {};
        if (config.aspectRatio) {
             additionalParams.image_config = { aspect_ratio: config.aspectRatio };
        }

        const rawClient = this.llm.getRawClient();
        
        let finalResult: any;
        let finalHistoryMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam;
        let columnValue: string | null;
        let finalExtension = 'txt';
        let finalType = 'text';
        let finalContentPayload: string | Buffer = '';

        if (config.jsonSchema) {
            // --- Branch A: JSON Schema ---
            
            const validator = async (data: any) => {
                // 1. Validate Schema
                const valid = this.ajv.validate(config.jsonSchema, data);
                if (!valid) {
                    const errors = this.ajv.errorsText();
                    throw new SchemaValidationError(`Schema Mismatch: ${errors}`);
                }

                // 2. Run Plugin Post-Processing Phase
                const syntheticHistory = [
                    ...finalMessages, 
                    { role: 'assistant', content: JSON.stringify(data) } as OpenAI.Chat.Completions.ChatCompletionMessageParam
                ];
                
                return await this.runPostProcessingPhase(data, syntheticHistory, row, index, stepIndex);
            };

            finalResult = await rawClient.promptJson(finalMessages, config.jsonSchema, {
                requestOptions,
                maxRetries: 3 + (config.feedbackLoops || 0),
                validator,
                ...additionalParams
            });

            finalHistoryMessage = {
                role: 'assistant',
                content: JSON.stringify(finalResult, null, 2)
            };
            columnValue = JSON.stringify(finalResult, null, 2);
            finalExtension = 'json';
            finalType = 'json';
            finalContentPayload = columnValue;

        } else {
            // --- Branch B: Standard / Retry ---

            let capturedContent: ExtractedContent | null = null;
            let capturedHistoryMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam | null = null;

            const validateCallback = async (response: any, info: LlmRetryResponseInfo) => {
                capturedHistoryMessage = completionToMessage(response);
                capturedContent = this.extractContent(capturedHistoryMessage);
                let data = capturedContent.data;

                return await this.runPostProcessingPhase(data, info.conversation, row, index, stepIndex);
            };

            finalResult = await rawClient.promptRetry({
                messages: finalMessages,
                requestOptions,
                maxRetries: 3 + (config.feedbackLoops || 0),
                validate: validateCallback,
                ...additionalParams
            });

            if (!capturedContent || !capturedHistoryMessage) throw new Error("Generation failed.");

            const content: ExtractedContent = capturedContent;
            finalHistoryMessage = capturedHistoryMessage;
            columnValue = content.data;
            finalExtension = content.extension;
            finalType = content.type;
            
            if (finalType === 'audio') {
                finalContentPayload = Buffer.from(content.data, 'base64');
            } else {
                finalContentPayload = content.data;
            }
        }

        // Emit Artifact
        const effectiveBasename = config.outputBasename || 'output';
        let filename = `${effectiveBasename}.${finalExtension}`;

        if (variationIndex !== undefined) {
            filename = `${effectiveBasename}_${variationIndex}.${finalExtension}`;
        }

        const targetDir = config.resolvedOutputDir || config.resolvedTempDir;
        if (targetDir) {
            filename = path.join(targetDir, filename);
        }

        // Check for empty content before emitting
        const hasContent = Buffer.isBuffer(finalContentPayload) 
            ? finalContentPayload.length > 0 
            : String(finalContentPayload).trim().length > 0;

        if (hasContent) {
            this.events.emit('plugin:artifact', {
                row: index,
                step: stepIndex,
                plugin: 'model',
                type: finalType,
                filename: filename,
                content: finalContentPayload,
                tags: ['final']
            });
        }

        return {
            historyMessage: finalHistoryMessage!,
            columnValue: typeof finalResult === 'string' ? finalResult : null,
            raw: finalResult
        };
    }
}
