import OpenAI from 'openai';
import Ajv from 'ajv';
import { SchemaValidationError } from 'llm-fns';
import { GenerationStrategy } from './GenerationStrategy.js';
import { StepRow } from '../StepRow.js';
import { PluginPacket } from '../plugins/types.js';

export class StandardStrategy implements GenerationStrategy {
    private ajv: any;

    constructor(
        private stepRow: StepRow
    ) {
        // @ts-ignore
        this.ajv = new Ajv.default ? new Ajv.default({ strict: false }) : new Ajv({ strict: false });
    }

    async execute(cacheSalt?: string | number): Promise<PluginPacket[]> {
        const config = await this.stepRow.hydratedConfig();
        const rowIndex = this.stepRow.getOriginalIndex();
        const stepIndex = this.stepRow.step.stepIndex;
        const finalMessages = await this.stepRow.getPreparedMessages();
        const schema = await this.stepRow.getResolvedSchema();

        const requestOptions = cacheSalt ? {
            headers: { 'X-Cache-Salt': String(cacheSalt) }
        } : undefined;

        const additionalParams: Record<string, any> = {};
        if (config.aspectRatio) {
             additionalParams.image_config = { aspect_ratio: config.aspectRatio };
        }

        const rawClient = (await this.stepRow.createLlm(config.model)).getRawClient();

        let finalResult: any;

        if (schema) {
            const validator = async (data: any) => {
                const valid = this.ajv.validate(schema, data);
                if (!valid) {
                    const errors = this.ajv.errorsText();
                    this.stepRow.getEvents().emit('validation:failed', {
                        row: rowIndex,
                        step: stepIndex,
                        data,
                        schema: schema,
                        errors: this.ajv.errors
                    });
                    throw new SchemaValidationError(`Schema Mismatch: ${errors}`);
                }
                return data;
            };

            finalResult = await rawClient.promptJson(finalMessages, schema, {
                requestOptions,
                maxRetries: 3 + (config.feedback?.loops || 0),
                validator,
                ...additionalParams
            });
        } else {
            finalResult = await rawClient.promptText({
                messages: finalMessages,
                requestOptions,
                ...additionalParams
            });
        }

        // Standard strategy returns a single packet with the result
        // If the result is an array (e.g. from JSON schema), it will be in data[0] if explode=false
        // or data=[...items] if explode=true.
        // However, the LLM returns ONE "thing" (object, array, or string).
        // We wrap it in an array for the PluginPacket data contract.
        
        // If the LLM returned an array (e.g. JSON list), we treat that as the data payload.
        // The StepRow.applyPacket logic will handle exploding it if config.explode is true.
        
        let dataPayload: any[] = [];
        if (Array.isArray(finalResult)) {
            dataPayload = finalResult;
        } else {
            dataPayload = [finalResult];
        }

        return [{
            data: dataPayload,
            contentParts: [],
            history: undefined // Standard strategy doesn't modify history
        }];
    }
}
