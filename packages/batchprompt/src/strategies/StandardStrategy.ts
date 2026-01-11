import Ajv from 'ajv';
import { SchemaValidationError } from 'llm-fns';
import { GenerationStrategy } from './GenerationStrategy.js';
import { StepRow } from '../StepRow.js';
import { PluginResult, PluginItem } from '../plugins/types.js';

export class StandardStrategy implements GenerationStrategy {
    private ajv: any;

    constructor(
        private stepRow: StepRow
    ) {
        // @ts-ignore
        this.ajv = new Ajv.default ? new Ajv.default({ strict: false }) : new Ajv({ strict: false });
    }

    async execute(cacheSalt?: string | number): Promise<PluginResult> {
        const config = this.stepRow.config;
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
                maxRetries: 3 + (config.feedbackLoops ?? 0),
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

        // Convert result to items
        // If result is array, each element becomes an item (for potential explosion)
        // Otherwise, single item with the result
        const items: PluginItem[] = Array.isArray(finalResult)
            ? finalResult.map(item => ({ data: item, contentParts: [] }))
            : [{ data: finalResult, contentParts: [] }];

        return {
            history: finalMessages,
            items
        };
    }
}
