import { z } from 'zod';
import Handlebars from 'handlebars';
import Ajv from 'ajv';
import { EventEmitter } from 'eventemitter3';
import {
    Plugin,
    PluginExecutionContext,
    PluginResult,
    CLIOptionDefinition
} from '../types.js';
import { ServiceCapabilities, ResolvedOutputConfig } from '../../config/resolvedTypes.js';
import { OutputConfigSchema } from '../../config/common.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';
import { zJsonSchemaObject, zHandlebars } from '../../config/validationRules.js';
import { PluginScope } from '../PluginScope.js';

// Strict Schema
export const ValidationConfigSchemaV2 = z.object({
    type: z.literal('validation').describe("Identifies this as a Validation plugin."),
    id: z.string().optional().describe("Unique ID for this plugin instance."),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }).describe("How to save validation results."),
    schema: zJsonSchemaObject.describe("JSON Schema to validate the data against."),
    target: zHandlebars.optional().describe("Data to validate (Handlebars template). Defaults to the current row.")
}).describe("Configuration for the Validation plugin.");

// Loose Schema
export const LooseValidationConfigSchemaV2 = ValidationConfigSchemaV2.extend({
    schema: z.union([z.string(), zJsonSchemaObject])
});

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

    readonly cliOptions: CLIOptionDefinition[] = [
        { flags: `--validate-schema <path>`, description: 'JSON Schema for validation' },
        { flags: `--validate-target <template>`, description: 'Data to validate (Handlebars template)' }
    ];

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return [];
    }

    parseCLIOptions(options: Record<string, any>, stepIndex: number): ValidationRawConfigV2 | null {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const schema = getOpt('validateSchema');
        if (!schema) return null;

        const partialConfig = {
            type: 'validation',
            schema,
            target: getOpt('validateTarget'),
            output: {
                mode: 'ignore',
                explode: false
            }
        };

        return this.configSchema.parse(partialConfig);
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

    async execute(
        config: ValidationResolvedConfigV2,
        context: PluginExecutionContext
    ): Promise<PluginResult> {
        const { row } = context;
        const scope = new PluginScope(context, this.type);

        let dataToValidate: any = row;

        if (config.target) {
            const template = Handlebars.compile(config.target, { noEscape: true });
            const jsonString = template(row);

            try {
                if (jsonString.trim().startsWith('{') || jsonString.trim().startsWith('[')) {
                    dataToValidate = JSON.parse(jsonString);
                } else {
                    dataToValidate = jsonString;
                }
            } catch {
                dataToValidate = jsonString;
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

            return { packets: [] };
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

        return {
            packets: [{
                data: {},
                contentParts: []
            }]
        };
    }
}
