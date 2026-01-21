import { z } from 'zod';
import Handlebars from 'handlebars';
import {
    BasePlugin,
    BasePluginRow
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { PartialOutputConfigSchema, StepConfig, GlobalConfig } from '../../config/schema.js';
import { zJsonSchemaObject, zHandlebars } from '../../config/validationRules.js';
import { ValidationPluginRow } from './ValidationPluginRow.js';

export const ValidationConfigSchema = z.object({
    type: z.literal('validation'),
    id: z.string().optional(),
    output: PartialOutputConfigSchema.optional(),
    schema: zJsonSchemaObject.describe("JSON Schema to validate against."),
    target: zHandlebars.optional().describe("Handlebars template for data to validate. Defaults to previous result."),
    failMode: z.enum(['drop', 'error', 'continue']).default('error')
        .describe("How to handle validation failures: drop row, throw error, or continue with metadata.")
}).strict();

export type ValidationConfig = z.output<typeof ValidationConfigSchema>;

export class ValidationPlugin extends BasePlugin<ValidationConfig, ValidationConfig> {
    readonly type = 'validation';

    getSchema() {
        return ValidationConfigSchema;
    }

    normalizeConfig(config: ValidationConfig, stepConfig: StepConfig, globalConfig: GlobalConfig): ValidationConfig {
        const base = super.normalizeConfig(config, stepConfig, globalConfig);

        return {
            ...base,
            id: config.id ?? `validation-${Date.now()}`,
        };
    }

    async hydrate(_stepConfig: StepConfig, _globalConfig: GlobalConfig, config: ValidationConfig, context: Record<string, any>): Promise<ValidationConfig> {
        // Hydrate target template if provided
        let target: string | undefined;
        if (config.target) {
            const template = Handlebars.compile(config.target, { noEscape: true });
            target = template(context);
        }

        return {
            ...config,
            target
        };
    }

    createRow(stepRow: StepRow, config: ValidationConfig): BasePluginRow<ValidationConfig> {
        return new ValidationPluginRow(stepRow, config);
    }
}
