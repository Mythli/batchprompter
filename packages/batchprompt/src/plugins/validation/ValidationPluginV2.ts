import { z } from 'zod';
import Handlebars from 'handlebars';
import Ajv from 'ajv';
import OpenAI from 'openai';
import { EventEmitter } from 'eventemitter3';
import {
    Plugin
} from '../types.js';
import { Step } from '../../core/Step.js';
import { StepRow } from '../../core/StepRow.js';
import { ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, DEFAULT_PLUGIN_OUTPUT } from '../../config/schemas/index.js';
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

    async init(step: Step, rawConfig: ValidationRawConfigV2): Promise<ValidationResolvedConfigV2> {
        let schema = rawConfig.schema;
        let schemaSource = '[inline]';

        if (typeof schema === 'string') {
            // If it looks like a template, skip static loading
            if (schema.includes('{{')) {
                // It will be resolved in prepare/postProcess
            } else {
                try {
                    const content = await step.globalContext.contentResolver.readText(schema);
                    schema = JSON.parse(content);
                    schemaSource = rawConfig.schema as string;
                } catch (e: any) {
                    throw new Error(`Failed to load schema from '${schema}': ${e.message}`);
                }
            }
        }

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

    async prepare(stepRow: StepRow, config: ValidationResolvedConfigV2): Promise<void> {
        // Validation happens in postProcess, but we might need to resolve dynamic schema here if we wanted to fail early.
        // However, validation usually checks the OUTPUT of the model, so we wait for postProcess.
    }

    async postProcess(
        stepRow: StepRow,
        config: ValidationResolvedConfigV2,
        result: any
    ): Promise<any> {
        const { context } = stepRow;
        const emit = stepRow.step.globalContext.events.emit.bind(stepRow.step.globalContext.events);
        
        const scope = new PluginScope({
            row: context,
            stepIndex: stepRow.step.stepIndex,
            pluginIndex: 0,
            tempDirectory: stepRow.resolvedTempDir || '/tmp',
            emit: emit
        }, this.type);

        // Resolve schema if it's still a template string
        let schema = config.schema;
        if (typeof schema === 'string') {
             try {
                 const template = Handlebars.compile(schema, { noEscape: true });
                 const resolvedPath = template(context);
                 const content = await stepRow.step.globalContext.contentResolver.readText(resolvedPath);
                 schema = JSON.parse(content);
             } catch (e: any) {
                 throw new Error(`Failed to load schema from template: ${e.message}`);
             }
        } else {
            schema = renderSchemaObject(schema, context);
        }

        let dataToValidate: any = result;

        if (config.target) {
            const template = Handlebars.compile(config.target, { noEscape: true });
            // We merge result into row for template context so we can validate response fields
            const templateContext = { ...context, response: result };
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
            if (typeof result === 'string') {
                try {
                    dataToValidate = JSON.parse(result);
                } catch (e) {
                    // Keep as string if parsing fails
                }
            }
        }

        const validate = this.ajv.compile(schema);
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

        return result;
    }
}
