import { z } from 'zod';
import Handlebars from 'handlebars';
import Ajv from 'ajv';
import {
    Plugin,
    PluginExecutionContext,
    PluginResult,
    CLIOptionDefinition
} from '../types.js';
import { ServiceCapabilities, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema } from '../../config/schema.js';
import { SchemaLoader } from '../../config/SchemaLoader.js';
import { DEFAULT_OUTPUT } from '../../config/defaults.js';

// =============================================================================
// Config Schema
// =============================================================================

export const ValidationConfigSchema = z.object({
    type: z.literal('validation'),
    id: z.string().optional(),
    output: OutputConfigSchema.optional(),
    schema: z.union([z.string(), z.record(z.any())]),
    target: z.string().optional()
});

export type ValidationRawConfig = z.infer<typeof ValidationConfigSchema>;

export interface ValidationResolvedConfig {
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

export class ValidationPlugin implements Plugin<ValidationRawConfig, ValidationResolvedConfig> {
    readonly type = 'validation';
    readonly configSchema = ValidationConfigSchema;

    private schemaLoader = new SchemaLoader();
    private ajv: any;

    constructor() {
        // @ts-ignore
        this.ajv = new Ajv.default ? new Ajv.default() : new Ajv();
    }

    readonly cliOptions: CLIOptionDefinition[] = [
        { flags: '--validate-schema <path>', description: 'JSON Schema for validation' },
        { flags: '--validate-target <template>', description: 'Data to validate (Handlebars template)' }
    ];

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return [];
    }

    parseCLIOptions(options: Record<string, any>, stepIndex: number): ValidationRawConfig | null {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const schema = getOpt('validateSchema');
        if (!schema) return null;

        return {
            type: 'validation',
            schema,
            target: getOpt('validateTarget')
        };
    }

    async resolveConfig(
        rawConfig: ValidationRawConfig,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
    ): Promise<ValidationResolvedConfig> {
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
                mode: rawConfig.output?.mode ?? DEFAULT_OUTPUT.mode,
                column: rawConfig.output?.column,
                explode: rawConfig.output?.explode ?? DEFAULT_OUTPUT.explode
            },
            schema,
            target: rawConfig.target,
            schemaSource
        };
    }

    async execute(
        config: ValidationResolvedConfig,
        context: PluginExecutionContext
    ): Promise<PluginResult> {
        const { row } = context;

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
            return { packets: [] }; // Drop item
        }

        console.log(`[Validation] ✅ Passed (${config.schemaSource})`);
        return {
            packets: [{
                data: {},
                contentParts: []
            }]
        };
    }
}
