import { z } from 'zod';
import Handlebars from 'handlebars';
import Ajv from 'ajv';
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

export const LooseValidationConfigSchemaV2 = z.object({
    type: z.literal('validation'),
    id: z.string().optional(),
    output: OutputConfigSchema.default(DEFAULT_PLUGIN_OUTPUT),
    schema: z.union([z.string(), zJsonSchemaObject]),
    target: zHandlebars.optional()
});

export const ValidationConfigSchemaV2 = LooseValidationConfigSchemaV2.extend({
    schema: zJsonSchemaObject
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
                // We no longer support file loading here. 
                // If it's a string and not a template, it must be a JSON string or we fail.
                try {
                    schema = JSON.parse(schema);
                    schemaSource = rawConfig.schema as string;
                } catch (e: any) {
                    // If it's not JSON, we assume it's a template that doesn't look like one, or invalid.
                    // But since we removed file loading, we can't resolve paths.
                    // We'll leave it as string if it fails parse, assuming it might be a template.
                }
            }
        }

        return {
            type: 'validation',
            id: rawConfig.id ?? `validation-${Date.now()}`,
            output: rawConfig.output,
            schema,
            target: rawConfig.target,
            schemaSource
        };
    }

    async prepare(stepRow: StepRow, config: ValidationResolvedConfigV2): Promise<void> {
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

        let schema = config.schema;
        if (typeof schema === 'string') {
             try {
                 const template = Handlebars.compile(schema, { noEscape: true });
                 const resolvedSchema = template(context);
                 schema = JSON.parse(resolvedSchema);
             } catch (e: any) {
                 throw new Error(`Failed to parse schema template: ${e.message}`);
             }
        } else {
            schema = renderSchemaObject(schema, context);
        }

        let dataToValidate: any = result;

        if (config.target) {
            const template = Handlebars.compile(config.target, { noEscape: true });
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
            if (typeof result === 'string') {
                try {
                    dataToValidate = JSON.parse(result);
                } catch (e) {
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
