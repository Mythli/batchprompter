import { Command } from 'commander';
import Handlebars from 'handlebars';
import Ajv from 'ajv';
import { ContentProviderPlugin, PluginContext, PluginResult, NormalizedPluginConfig } from '../types.js';
import { PromptResolver } from '../../utils/PromptResolver.js';

interface ValidationConfig {
    schemaPath: string;
    targetTemplate?: string;
}

interface ValidationResolvedConfig {
    schema: any;
    targetTemplate?: string;
}

export class ValidationPlugin implements ContentProviderPlugin {
    name = 'validation';
    private ajv: Ajv;

    constructor() {
        // Handle ESM/CommonJS import differences for Ajv if necessary
        // @ts-ignore
        this.ajv = new Ajv.default ? new Ajv.default() : new Ajv();
    }

    register(program: Command): void {
        program.option('--validate-schema <path>', 'Path to JSON schema file');
        program.option('--validate-target <template>', 'Data to validate (Handlebars template). Defaults to whole row.');
    }

    registerStep(program: Command, stepIndex: number): void {
        program.option(`--validate-schema-${stepIndex} <path>`, `Schema path for step ${stepIndex}`);
        program.option(`--validate-target-${stepIndex} <template>`, `Target data for step ${stepIndex}`);
    }

    normalize(options: Record<string, any>, stepIndex: number, globalConfig: any): NormalizedPluginConfig | undefined {
        const getOpt = (key: string) => {
            const specific = options[`${key}${stepIndex}`];
            if (specific !== undefined) return specific;
            return options[key];
        };

        const schemaPath = getOpt('validateSchema');
        if (!schemaPath) return undefined;

        return {
            config: {
                schemaPath,
                targetTemplate: getOpt('validateTarget')
            }
        };
    }

    async prepare(config: ValidationConfig, row: Record<string, any>): Promise<ValidationResolvedConfig> {
        // Resolve schema path
        const parts = await PromptResolver.resolve(config.schemaPath, row);
        let schema: any;
        
        if (parts.length > 0 && parts[0].type === 'text') {
            try {
                schema = JSON.parse(parts[0].text);
            } catch (e) {
                throw new Error(`[Validation] Failed to parse JSON schema from ${config.schemaPath}`);
            }
        } else {
             throw new Error(`[Validation] Could not load schema from ${config.schemaPath}`);
        }

        return {
            schema,
            targetTemplate: config.targetTemplate
        };
    }

    async execute(context: PluginContext): Promise<PluginResult> {
        const { row, config } = context;
        const resolved = config as ValidationResolvedConfig;

        let dataToValidate: any = row;

        if (resolved.targetTemplate) {
            const jsonString = Handlebars.compile(resolved.targetTemplate, { noEscape: true })(row);
            try {
                // Try to parse as JSON if it looks like object/array
                if (jsonString.trim().startsWith('{') || jsonString.trim().startsWith('[')) {
                    dataToValidate = JSON.parse(jsonString);
                } else {
                    dataToValidate = jsonString;
                }
            } catch (e) {
                // If parse fails, treat as string
                dataToValidate = jsonString;
            }
        }

        const validate = this.ajv.compile(resolved.schema);
        const valid = validate(dataToValidate);

        if (!valid) {
            console.log(`[Validation] Row failed validation: ${this.ajv.errorsText(validate.errors)}`);
            return { contentParts: [], data: [] }; // Drop
        }

        return { contentParts: [], data: [{}] }; // Pass
    }
}
