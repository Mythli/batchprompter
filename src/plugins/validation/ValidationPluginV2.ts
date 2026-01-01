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
import { ServiceCapabilities, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema } from '../../config/common.js';
import { SchemaLoader } from '../../config/SchemaLoader.js';

// =============================================================================
// Config Schema
// =============================================================================

export const ValidationConfigSchemaV2 = z.object({
    type: z.literal('validation'),
    id: z.string().optional(),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }),
    schema: z.union([z.string(), z.record(z.string(), z.any())]),
    target: z.string().optional()
});

export type ValidationRawConfigV2 = z.infer<typeof ValidationConfigSchemaV2>;

export interface ValidationResolvedConfigV2 {
    type: 'validation';
    id: string;
    output: ResolvedOutputConfig;
    schema: any;
    target?: string;
    schemaSource: string;
}

// =============================================================================
// Plugin
// =============================================================================

export class ValidationPluginV2 implements Plugin<ValidationRawConfigV2, ValidationResolvedConfigV2> {
    readonly type = 'validation';
    readonly configSchema = ValidationConfigSchemaV2;
    public readonly events = new EventEmitter();

    private schemaLoader = new SchemaLoader();
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

    async resolveConfig(
        rawConfig: ValidationRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
    ): Promise<ValidationResolvedConfigV2> {
        let schema: any;
        let schemaSource: string;

        if (typeof rawConfig.schema === 'string') {
            schema = await this.schemaLoader.loadWithContext(rawConfig.schema, row);
            schemaSource = rawConfig.schema.length > 50
                ? rawConfig.schema.substring(0, 47) + '...'
                : rawConfig.schema;
        } else {
            schema = rawConfig.schema;
            schemaSource = '[inline]';
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
        const { row, emit } = context;

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
            console.log(`[Validation] ❌ Failed (${config.schemaSource}): ${errors}`);
            
            emit('artifact', {
                row: context.row.index,
                step: context.stepIndex,
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

            return { packets: [] }; // Drop item
        }

        console.log(`[Validation] ✅ Passed (${config.schemaSource})`);
        
        emit('artifact', {
            row: context.row.index,
            step: context.stepIndex,
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
