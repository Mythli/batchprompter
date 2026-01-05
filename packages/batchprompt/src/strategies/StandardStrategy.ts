import OpenAI from 'openai';
import path from 'path';
import Ajv from 'ajv';
import { completionToMessage, LlmRetryError, LlmRetryResponseInfo, SchemaValidationError } from 'llm-fns';
import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { StepConfig } from '../types.js';
import { MessageBuilder } from '../core/MessageBuilder.js';
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
        private messageBuilder: MessageBuilder,
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
            const text = content
                .filter(p => p.type === 'text')
                .map(p => p.text)
                .join('\n');
            
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

    private async runPreparationPhase(
        baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        row: Record<string, any>,
        index: number,
        stepIndex: number
    ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
        let messageSets: OpenAI.Chat.Completions.ChatCompletionMessageParam[][] = [baseMessages];

        for (let i = 0; i < this.plugins.length; i++) {
            const { instance, config: pluginConfig } = this.plugins[i];
            if (instance.prepareMessages) {
                const context = this.createPluginContext(row, stepIndex, i, index);
                const nextMessageSets: OpenAI.Chat.Completions.ChatCompletionMessageParam[][] = [];
                
                for (const msgSet of messageSets) {
                    const result = await instance.prepareMessages(msgSet, pluginConfig, context);
                    if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
                        // Explode
                        nextMessageSets.push(...(result as OpenAI.Chat.Completions.ChatCompletionMessageParam[][]));
                    } else {
                        nextMessageSets.push(result as OpenAI.Chat.Completions.ChatCompletionMessageParam[]);
                    }
                }
                messageSets = nextMessageSets;
            }
        }

        if (messageSets.length > 1) {
            this.events.emit('step:progress', { row: index, step: stepIndex, type: 'warn', message: `Plugin returned multiple message sets (explode), but StandardStrategy only supports one. Using the first set.` });
        }
        
        return messageSets[0];
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
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        cacheSalt?: string | number,
        outputPathOverride?: string,
        skipCommands: boolean = false,
        variationIndex?: number
    ): Promise<GenerationResult> {

        // 1. Build Initial Messages
        let currentMessages = this.messageBuilder.build(config.modelConfig, row, userPromptParts);
        
        // Inject History
        const systemMsg = currentMessages.find(m => m.role === 'system');
        const userMsgs = currentMessages.filter(m => m.role !== 'system');
        
        const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
        if (systemMsg) baseMessages.push(systemMsg);
        baseMessages.push(...history);
        baseMessages.push(...userMsgs);

        // 2. Run Plugin Preparation Phase
        const finalMessages = await this.runPreparationPhase(baseMessages, row, index, stepIndex);

        // 3. Generation Loop
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
            // Use promptJson which handles schema injection, response_format, and auto-fixing
            
            const validator = async (data: any) => {
                // 1. Validate Schema
                const valid = this.ajv.validate(config.jsonSchema, data);
                if (!valid) {
                    const errors = this.ajv.errorsText();
                    // Throw SchemaValidationError to trigger promptJson's fixer
                    throw new SchemaValidationError(`Schema Mismatch: ${errors}`);
                }

                // 2. Run Plugin Post-Processing Phase
                // Construct synthetic history for plugins so they see the assistant's response
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
            // Use promptRetry for text, image, audio, or unstructured output

            // Variables to capture state from inside the callback
            let capturedContent: ExtractedContent | null = null;
            let capturedHistoryMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam | null = null;

            const validateCallback = async (response: any, info: LlmRetryResponseInfo) => {
                // 1. Normalize & Extract
                capturedHistoryMessage = completionToMessage(response);
                capturedContent = this.extractContent(capturedHistoryMessage);
                let data = capturedContent.data;

                // 2. Run Plugin Post-Processing Phase
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

        this.events.emit('plugin:artifact', {
            row: index,
            step: stepIndex,
            plugin: 'model',
            type: finalType,
            filename: filename,
            content: finalContentPayload,
            tags: ['final']
        });

        return {
            historyMessage: finalHistoryMessage,
            columnValue: columnValue,
            raw: finalResult
        };
    }
}
