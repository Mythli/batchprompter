import { z } from 'zod';
import Handlebars from 'handlebars';
import Ajv from 'ajv';
import OpenAI from 'openai';
import { EventEmitter } from 'eventemitter3';
import {
    Plugin,
    PluginExecutionContext
} from '../types.js';
import { ServiceCapabilities, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, DEFAULT_PLUGIN_OUTPUT } from '../../config/schemas/index.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';
import { zJsonSchemaObject, zHandlebars } from '../../config/validationRules.js';
import { PluginScope } from '../PluginScope.js';
import { renderSchemaObject } from '../../utils/schemaUtils.js';

// Loose Schema (String or Object for schema field) - defined first as base
export const LooseValidationConfigSchemaV2 = z.object({
    type: z.literal('validation').describe("Identifies this as a Validation plugin."),
    id: z.string().optional().describe("Unique ID for this plugin instance."),
    output: OutputConfigSchema.default(DEFAULT_PLUGIN_OUTPUT).describe("How to save validation results."),
    
    // Required
    schema: z.union([z.string(), zJsonSchemaObject]).describe("JSON Schema to validate the data against. Can be inline object or file path."),
    
    // Optional
    target: zHandlebars.optional().describe("Data to validate (Handlebars template). Defaults to the current row.")
}).describe("Configuration for the Validation plugin.");

// Strict Schema (Object only) - derived by narrowing the schema field
export const ValidationConfigSchemaV2 = LooseValidationConfigSchemaV2.extend({
    schema: zJsonSchemaObject.describe("JSON Schema to validate the data against.")
}).strict();

export type ValidationRawConfigV2 = z.infer<typeof LooseValidationConfigSchemaV2>;

export interface ValidationResolvedConfigV2 {
    type: 'validation';
    id: string;
    output: ResolvedOutputConfig;
    schema: any;
    target?: string;
    schemaSource: string;
}

export class ValidationPluginV2 implements Plugin<ValidationRawConfigV2, ValidationResolvedConfigV2> {
    readonly type = 'validation';
    readonly configSchema = LooseValidationConfigSchemaV2;
    public readonly events = new EventEmitter();

    private ajv: any;

    constructor() {
        // @ts-ignore
        this.ajv = new Ajv.default ? new Ajv.default() : new Ajv();
    }

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return [];
    }

    async normalizeConfig(
        config: ValidationRawConfigV2,
        contentResolver: ContentResolver
    ): Promise<ValidationRawConfigV2> {
        if (typeof config.schema === 'string') {
            // If it looks like a template, skip static loading
            if (config.schema.includes('{{')) {
                return config;
            }
            
            try {
                const content = await contentResolver.readText(config.schema);
                return {
                    ...config,
                    schema: JSON.parse(content)
                };
            } catch (e: any) {
                throw new Error(`Failed to load schema from '${config.schema}': ${e.message}`);
            }
        }
        return config;
    }

    async resolveConfig(
        rawConfig: ValidationRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' },
        contentResolver: ContentResolver
    ): Promise<ValidationResolvedConfigV2> {
        let schema = rawConfig.schema;
        let schemaSource = '[inline]';

        if (typeof schema === 'string') {
             throw new Error("Schema must be an object. Ensure ConfigNormalizer is used.");
        }

        // Render schema templates
        schema = renderSchemaObject(schema, row);

        return {
            type: 'validation',
            id: rawConfig.id ?? `validation-${Date.now()}`,
            output: {
                mode: rawConfig.output.mode,
                column: rawConfig.output.column,
                explode: rawConfig.output.explode
            },
            schema,
            target: rawConfig.target,
            schemaSource
        };
    }

    async postProcessMessages(
        response: any,
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        config: ValidationResolvedConfigV2,
        context: PluginExecutionContext
    ): Promise<any> {
        const { row } = context;
        const scope = new PluginScope(context, this.type);

        let dataToValidate: any = response;

        // If target is specified, we validate that specific data instead of the response
        // However, usually validation plugin validates the LLM output (response).
        // If target is used, it might be validating something from the row context.
        // But postProcessMessages is designed to validate/transform the response.
        
        if (config.target) {
            const template = Handlebars.compile(config.target, { noEscape: true });
            // We merge response into row for template context so we can validate response fields
            const templateContext = { ...row, response };
            const jsonString = template(templateContext);

            try {
                if (jsonString.trim().startsWith('{') || jsonString.trim().startsWith('[')) {
                    dataToValidate = JSON.parse(jsonString);
                } else {
                    dataToValidate = jsonString;
                }
            } catch {
                dataToValidate = jsonString;
            }
        } else {
            // Default behavior: Validate the response object directly
            // If response is a string (e.g. raw text), try to parse it if schema expects object/array
            if (typeof response === 'string') {
                try {
                    dataToValidate = JSON.parse(response);
                } catch (e) {
                    // Keep as string if parsing fails
                }
            }
        }

        const validate = this.ajv.compile(config.schema);
        const valid = validate(dataToValidate);

        if (!valid) {
            const errors = this.ajv.errorsText(validate.errors);
            scope.emit('validation:failed', { source: config.schemaSource, errors });
            
            scope.artifact({
                type: 'json',
                filename: `validation/validation_${Date.now()}.json`,
                content: JSON.stringify({
                    schemaSource: config.schemaSource,
                    target: config.target,
                    data: dataToValidate,
                    valid: false,
                    errors
                }, null, 2),
                tags: ['debug', 'validation', 'error']
            });

            // Throw error to trigger retry in StandardStrategy
            throw new Error(`Validation failed: ${errors}`);
        }

        scope.emit('validation:passed', { source: config.schemaSource });
        
        scope.artifact({
            type: 'json',
            filename: `validation/validation_${Date.now()}.json`,
            content: JSON.stringify({
                schemaSource: config.schemaSource,
                target: config.target,
                data: dataToValidate,
                valid: true
            }, null, 2),
            tags: ['debug', 'validation', 'success']
        });

        // Return the original response (or validated data if we want to enforce transformation)
        // Usually we pass through the response.
        return response;
    }
}
