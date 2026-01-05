import OpenAI from 'openai';
import path from 'path';
import Ajv from 'ajv';
import { completionToMessage, LlmRetryError, LlmRetryResponseInfo } from 'llm-fns';
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

        // 2. Run Plugin Preparation Phase (prepareMessages)
        let messageSets: OpenAI.Chat.Completions.ChatCompletionMessageParam[][] = [baseMessages];

        for (let i = 0; i < this.plugins.length; i++) {
            const { instance, config: pluginConfig } = this.plugins[i];
            if (instance.prepareMessages) {
                const context: PluginExecutionContext = {
                    row,
                    stepIndex,
                    pluginIndex: i,
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
        
        const finalMessages = messageSets[0];

        // 3. Generation Loop (Delegated to llm-fns via promptRetry)
        const requestOptions = cacheSalt ? {
            headers: { 'X-Cache-Salt': String(cacheSalt) }
        } : undefined;

        const additionalParams: Record<string, any> = {};
        if (config.aspectRatio) {
             additionalParams.image_config = { aspect_ratio: config.aspectRatio };
        }

        // If JSON schema is present, enforce JSON object mode
        const response_format = config.jsonSchema ? { type: 'json_object' } : undefined;

        // Add schema instruction to system prompt if needed
        if (config.jsonSchema) {
            const schemaJsonString = JSON.stringify(config.jsonSchema);
            const commonPromptFooter = `
Your response MUST be a single JSON entity (object or array) that strictly adheres to the following JSON schema.
Do NOT include any other text, explanations, or markdown formatting (like \`\`\`json) before or after the JSON entity.

JSON schema:
${schemaJsonString}`;

            const systemMessageIndex = finalMessages.findIndex(m => m.role === 'system');
            if (systemMessageIndex !== -1) {
                const existingContent = finalMessages[systemMessageIndex].content;
                finalMessages[systemMessageIndex] = {
                    ...finalMessages[systemMessageIndex],
                    content: `${existingContent}\n${commonPromptFooter}`
                };
            } else {
                finalMessages.unshift({
                    role: 'system',
                    content: commonPromptFooter
                });
            }
        }

        // Variables to capture the final state from the validation callback
        let finalHistoryMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam | null = null;
        let finalContent: ExtractedContent | null = null;

        const validateCallback = async (response: any, info: LlmRetryResponseInfo) => {
            // 1. Normalize & Extract
            finalHistoryMessage = completionToMessage(response);
            finalContent = this.extractContent(finalHistoryMessage);
            let data = finalContent.data;

            // 2. JSON Handling (Implicit "Plugin")
            if (config.jsonSchema) {
                try {
                    // Handle markdown code blocks if present
                    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
                    const match = codeBlockRegex.exec(data);
                    if (match && match[1]) {
                        data = match[1].trim();
                    }
                    
                    data = JSON.parse(data);
                } catch (e: any) {
                    throw new LlmRetryError(`Invalid JSON: ${e.message}`, 'JSON_PARSE_ERROR', undefined, finalContent.data);
                }
                
                const valid = this.ajv.validate(config.jsonSchema, data);
                if (!valid) {
                    const errors = this.ajv.errorsText();
                    throw new LlmRetryError(`Schema Mismatch: ${errors}`, 'CUSTOM_ERROR', undefined, JSON.stringify(data, null, 2));
                }
            }

            // 3. Plugin Chain
            for (let i = 0; i < this.plugins.length; i++) {
                const { instance, config: pluginConfig } = this.plugins[i];
                if (instance.postProcessMessages) {
                    const context: PluginExecutionContext = {
                        row,
                        stepIndex,
                        pluginIndex: i,
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

                    try {
                        data = await instance.postProcessMessages(data, info.conversation, pluginConfig, context);
                    } catch (e: any) {
                        throw new LlmRetryError(e.message, 'CUSTOM_ERROR', undefined, typeof data === 'string' ? data : JSON.stringify(data));
                    }
                }
            }

            return data;
        };

        const rawClient = this.llm.getRawClient();
        const finalResult = await rawClient.promptRetry({
            messages: finalMessages,
            requestOptions,
            response_format: response_format as any,
            maxRetries: 3 + (config.feedbackLoops || 0), // Combine standard retries with feedback loops
            validate: validateCallback,
            ...additionalParams
        });

        if (!finalContent || !finalHistoryMessage) throw new Error("Generation failed.");

        // Emit Artifact
        const effectiveBasename = config.outputBasename || 'output';
        let filename = `${effectiveBasename}.${finalContent.extension}`;

        if (variationIndex !== undefined) {
            filename = `${effectiveBasename}_${variationIndex}.${finalContent.extension}`;
        }

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

        // If the result was parsed JSON, update the extracted content data to be the stringified version
        // but keep the raw object available.
        let columnValue = finalContent.data;
        if (typeof finalResult === 'object' && finalResult !== null) {
            columnValue = JSON.stringify(finalResult, null, 2);
        } else if (typeof finalResult === 'string') {
            columnValue = finalResult;
        }

        return {
            historyMessage: finalHistoryMessage,
            columnValue: columnValue,
            raw: finalResult
        };
    }
}
