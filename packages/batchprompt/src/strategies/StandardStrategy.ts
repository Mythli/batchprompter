import OpenAI from 'openai';
import path from 'path';
import Ajv from 'ajv';
import { completionToMessage, LlmRetryError, LlmRetryResponseInfo, SchemaValidationError, concatMessageText } from 'llm-fns';
import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { StepRow } from '../StepRow.js';

type ExtractedContent = {
    type: 'text' | 'image' | 'audio';
    data: string;
    extension: string;
    raw?: any;
};

export class StandardStrategy implements GenerationStrategy {
    private ajv: any;

    constructor(
        private stepRow: StepRow
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

            const text = concatMessageText([message]);
            return { type: 'text', data: text, extension: 'md' };
        }

        return { type: 'text', data: '', extension: 'md' };
    }

    private async runPostProcessingPhase(
        initialData: any
    ): Promise<any> {
        let currentData = initialData;
        const plugins = this.stepRow.getPlugins();

        for (let i = 0; i < plugins.length; i++) {
            const { instance, config: pluginConfig } = plugins[i];
            if (instance.postProcess) {
                try {
                    const packet = await instance.postProcess(this.stepRow, pluginConfig, currentData);
                    if (packet) {
                        currentData = packet.data;
                    }
                } catch (e: any) {
                    throw new LlmRetryError(e.message, 'CUSTOM_ERROR', undefined, typeof currentData === 'string' ? currentData : JSON.stringify(currentData));
                }
            }
        }

        return currentData;
    }

    async execute(cacheSalt?: string | number): Promise<GenerationResult> {
        const config = this.stepRow.step.config;
        const index = this.stepRow.item.originalIndex;
        const stepIndex = this.stepRow.step.stepIndex;
        const variationIndex = this.stepRow.item.variationIndex;
        const finalMessages = this.stepRow.preparedMessages;
        const schema = this.stepRow.resolvedSchema;

        const requestOptions = cacheSalt ? {
            headers: { 'X-Cache-Salt': String(cacheSalt) }
        } : undefined;

        const additionalParams: Record<string, any> = {};
        if (config.aspectRatio) {
             additionalParams.image_config = { aspect_ratio: config.aspectRatio };
        }

        const rawClient = this.stepRow.createLlm(config.model).getRawClient();

        let finalResult: any;
        let finalHistoryMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam;
        let finalExtension = 'txt';
        let finalType = 'text';
        let finalContentPayload: string | Buffer = '';

        if (schema) {
            const validator = async (data: any) => {
                const valid = this.ajv.validate(schema, data);
                if (!valid) {
                    const errors = this.ajv.errorsText();
                    this.stepRow.getEvents().emit('validation:failed', {
                        row: index,
                        step: stepIndex,
                        data,
                        schema: schema,
                        errors: this.ajv.errors
                    });
                    throw new SchemaValidationError(`Schema Mismatch: ${errors}`);
                }
                return await this.runPostProcessingPhase(data);
            };

            finalResult = await rawClient.promptJson(finalMessages, schema, {
                requestOptions,
                maxRetries: 3 + (config.feedback?.loops || 0),
                validator,
                ...additionalParams
            });

            finalHistoryMessage = {
                role: 'assistant',
                content: JSON.stringify(finalResult, null, 2)
            };
            finalExtension = 'json';
            finalType = 'json';