import { z } from 'zod';
import Handlebars from 'handlebars';
import Ajv from 'ajv';
import { EventEmitter } from 'eventemitter3';
import {
    BasePlugin,
    PluginPacket
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, DEFAULT_PLUGIN_OUTPUT } from '../../config/schemas/index.js';
import { zJsonSchemaObject, zHandlebars } from '../../config/validationRules.js';
import { PluginScope } from '../PluginScope.js';
import { renderSchemaObject } from '../../utils/schemaUtils.js';
import { StepBaseConfig, GlobalsConfig } from '../../config/schema.js';

export const LooseValidationConfigSchemaV2 = z.object({
    type: z.literal('validation'),
    id: z.string().optional(),
    output: OutputConfigSchema.default(DEFAULT_PLUGIN_OUTPUT),
    schema: z.union([z.string(), zJsonSchemaObject]),
    target: zHandlebars.optional()
});

export interface ValidationConfig {
    type: 'validation';
    id: string;
    output: ResolvedOutputConfig;
    schema: any;
    target?: string;
    schemaSource: string;
}

export class ValidationPluginV2 extends BasePlugin<ValidationConfig> {
    readonly type = 'validation';
    public readonly events = new EventEmitter();

    private ajv: any;

    constructor() {
        super();
        // @ts-ignore
        this.ajv = new Ajv.default ? new Ajv.default() : new Ajv();
    }

    getSchema(step: StepBaseConfig, globals: GlobalsConfig) {
        return LooseValidationConfigSchemaV2.transform(config => {
            let schema = config.schema;
            let schemaSource = '[inline]';

            if (typeof schema === 'string' && !schema.includes('{{')) {
                try {
                    schema = JSON.parse(schema);
                    schemaSource = config.schema as string;
                } catch (e: any) {}
            }

            return {
                ...config,
                id: config.id ?? `validation-${Date.now()}`,
                schema,
                schemaSource
            };
        });
    }

    async hydrate(config: ValidationConfig, context: Record<string, any>): Promise<ValidationConfig> {
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

        let target = config.target;
        if (target) {
            // We don't render target here because it depends on the *result* of the step,
            // which isn't available at init time.
            // Wait, target is a template string that selects data from the context/result.
            // If it selects from context, we could render it.
            // But usually validation runs on the result.
        }

        return {
            ...config,
            schema,
            target
        };
    }

    async postProcess(
        stepRow: StepRow,
        config: ValidationConfig,
        result: any
    ): Promise<PluginPacket[]> {
        const { context } = stepRow;

        const emit = (event: any, ...args: any[]) => {
            stepRow.step.globalContext.events.emit(event, ...args);
        };

        const scope = new PluginScope({
            row: context,
            stepIndex: stepRow.step.stepIndex,
            pluginIndex: 0,
            tempDirectory: await stepRow.getTempDir(),
            emit: emit
        }, this.type);

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

            // Return empty array to filter/drop
            return [];
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

        // Return original result to continue
        return [{
            data: [result],
            contentParts: []
        }];
    }
}
