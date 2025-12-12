import { Command } from 'commander';
import Handlebars from 'handlebars';
import Ajv from 'ajv';
import { ContentProviderPlugin, PluginContext, PluginResult, NormalizedPluginConfig } from '../types.js';
import { SchemaHelper } from '../../utils/SchemaHelper.js';
import { ServiceCapabilities } from '../../types.js';

interface ValidationConfig {
    schemaPath: string;
    targetTemplate?: string;
}

interface ValidationResolvedConfig {
    schema: any;
    targetTemplate?: string;
    schemaSource: string;
}

export class ValidationPlugin implements ContentProviderPlugin {
    name = 'validation';
    private ajv: any;

    constructor() {
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

    normalize(
        options: Record<string, any>, 
        stepIndex: number, 
        globalConfig: any,
        capabilities: ServiceCapabilities
    ): NormalizedPluginConfig | undefined {
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
        let schema: any;
        
        if (config.schemaPath) {
            try {
                schema = await SchemaHelper.loadAndRenderSchema(config.schemaPath, row);
            } catch (e: any) {
                throw new Error(`[Validation] ${e.message}`);
            }
        } else {
             throw new Error(`[Validation] Schema path is required.`);
        }

        let schemaSource = config.schemaPath;
        if (schemaSource.length > 50) {
            schemaSource = schemaSource.substring(0, 47) + '...';
        }

        return {
            schema,
            targetTemplate: config.targetTemplate,
            schemaSource
        };
    }

    async execute(context: PluginContext): Promise<PluginResult> {
        const { row, config } = context;
        const resolved = config as ValidationResolvedConfig;

        let dataToValidate: any = row;

        if (resolved.targetTemplate) {
            const jsonString = Handlebars.compile(resolved.targetTemplate, { noEscape: true })(row);
            try {
                if (jsonString.trim().startsWith('{') || jsonString.trim().startsWith('[')) {
                    dataToValidate = JSON.parse(jsonString);
                } else {
                    dataToValidate = jsonString;
                }
            } catch (e) {
                dataToValidate = jsonString;
            }
        }

        const validate = this.ajv.compile(resolved.schema);
        const valid = validate(dataToValidate);

        if (!valid) {
            const errors = this.ajv.errorsText(validate.errors);
            console.log(`[Row ${row.index}] [Validation] ❌ Failed (${resolved.schemaSource}): ${errors}`);
            return { packets: [] }; // Drop item
        }

        console.log(`[Row ${row.index}] [Validation] ✅ Passed (${resolved.schemaSource}).`);
        return { 
            packets: [{
                data: {},
                contentParts: []
            }] 
        };
    }
}
