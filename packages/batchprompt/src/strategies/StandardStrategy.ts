import OpenAI from 'openai';
import path from 'path';
import { completionToMessage } from 'llm-fns';
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
    constructor(
        private llm: BoundLlmClient,
        private messageBuilder: MessageBuilder,
        private events: EventEmitter<BatchPromptEvents>,
        private plugins: { instance: Plugin; config: any; def: ResolvedPluginBase }[],
        private pluginServices: PluginServices,
        private tempDir: string
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
        // This handles data gathering, prompt enrichment, and potential explosion
        let messageSets: OpenAI.Chat.Completions.ChatCompletionMessageParam[][] = [baseMessages];

        for (let i = 0; i < this.plugins.length; i++) {
            const { instance, config: pluginConfig, def } = this.plugins[i];
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

        // If we have multiple message sets (explosion), we need to handle that.
        // Currently GenerationResult only supports a single result.
        // For now, we'll take the first one if multiple, or throw if not supported.
        // Ideally, StandardStrategy should return an array, but that requires larger refactor.
        // Given the constraints, we'll process the first set and warn if others exist.
        // Or we loop and return the last one?
        // Let's assume for now no explosion in prepareMessages for StandardStrategy context.
        
        if (messageSets.length > 1) {
            this.events.emit('step:progress', { row: index, step: stepIndex, type: 'warn', message: `Plugin returned multiple message sets (explode), but StandardStrategy only supports one. Using the first set.` });
        }
        
        const finalMessages = messageSets[0];

        // 3. Generation Loop (with Retry & Post-Processing)
        const totalIterations = 1 + (config.feedbackLoops || 0);
        let finalContent: ExtractedContent | null = null;
        let finalHistoryMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam | null = null;
        let finalRaw: any = undefined;

        const currentHistory = [...finalMessages]; // This now includes system, history, user, and plugin additions

        for (let loop = 0; loop < totalIterations; loop++) {
            const isFeedbackLoop = loop > 0;

            if (isFeedbackLoop) {
                this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `🔄 Feedback Loop ${loop}/${config.feedbackLoops}` });
            }

            const result = await this.generateWithRetry(
                currentHistory,
                config,
                row,
                index,
                stepIndex,
                cacheSalt
            );

            finalContent = result.extracted;
            finalHistoryMessage = result.historyMessage;
            finalRaw = result.extracted.raw;

            // If feedback loops are active, we need to update history for the next iteration
            if (isFeedbackLoop || totalIterations > 1) {
                currentHistory.push(finalHistoryMessage);
                // TODO: Add feedback prompt from judge/feedback model here if we want true feedback loop
            }
        }

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

        return {
            historyMessage: finalHistoryMessage,
            columnValue: finalContent.data,
            raw: finalRaw
        };
    }

    private async generateWithRetry(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        config: StepConfig,
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        cacheSalt?: string | number
    ): Promise<{ extracted: ExtractedContent, historyMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam }> {
        const maxRetries = 3;
        let currentMessages = [...messages];
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
                let historyMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam;
                let rawResponse: any;

                // A. Call LLM
                if (config.jsonSchema) {
                    const rawClient = this.llm.getRawClient();
                    // Note: promptJson handles its own retries for JSON syntax, but we wrap it here
                    // to handle plugin-level validation failures (postProcessMessages).
                    const jsonResult = await rawClient.promptJson(
                        currentMessages,
                        config.jsonSchema,
                        requestOptions ? { requestOptions, ...additionalParams } : (Object.keys(additionalParams).length > 0 ? additionalParams : undefined)
                    );

                    extracted = {
                        type: 'text',
                        data: JSON.stringify(jsonResult, null, 2),
                        extension: 'json',
                        raw: jsonResult
                    };
                    
                    historyMessage = { role: 'assistant', content: extracted.data };
                    rawResponse = jsonResult;

                } else {
                    const response = await this.llm.prompt({
                        messages: currentMessages,
                        requestOptions,
                        ...additionalParams
                    });

                    historyMessage = completionToMessage(response);
                    extracted = this.extractContent(historyMessage);
                    rawResponse = extracted.data; // Or full response? Plugins might expect different things.
                }

                // B. Run Plugin Post-Processing (Validation/Extraction)
                let currentResult = rawResponse;

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

                        // Pass the result through the chain
                        currentResult = await instance.postProcessMessages(currentResult, currentMessages, pluginConfig, context);
                    }
                }

                // If we got here, everything passed!
                // Update extracted.raw with the final processed result if it changed
                if (currentResult !== rawResponse) {
                    extracted.raw = currentResult;
                    if (typeof currentResult === 'string') {
                        extracted.data = currentResult;
                    } else {
                        extracted.data = JSON.stringify(currentResult, null, 2);
                    }
                }

                return { extracted, historyMessage };

            } catch (error: any) {
                lastError = error;
                this.events.emit('step:progress', { row: index, step: stepIndex, type: 'warn', message: `Attempt ${attempt+1}/${maxRetries+1} failed: ${error.message}` });

                if (attempt < maxRetries) {
                    // Add error to history to guide the model in the next attempt
                    currentMessages.push({
                        role: 'user',
                        content: `The previous response was invalid:\n${error.message}\n\nPlease fix the issue and try again.`
                    });
                }
            }
        }
        throw new Error(`Generation failed after ${maxRetries + 1} attempts. Last error: ${lastError?.message}`);
    }
}
