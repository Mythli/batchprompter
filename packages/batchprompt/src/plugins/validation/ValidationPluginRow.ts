import Ajv from 'ajv';
import { BasePluginRow, PluginResult } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { ValidationConfig } from './ValidationPlugin.js';

export class ValidationPluginRow extends BasePluginRow<ValidationConfig> {
    private ajv: any;

    constructor(
        stepRow: StepRow,
        config: ValidationConfig
    ) {
        super(stepRow, config);
        // @ts-ignore
        this.ajv = new Ajv.default ? new Ajv.default({ strict: false }) : new Ajv({ strict: false });
    }

    /**
     * Validation happens in postProcess after LLM execution.
     * Reads the accumulated row data from stepRow.getData() — the single source of truth.
     */
    async postProcess(): Promise<PluginResult> {
        const { stepRow, config } = this;
        const events = stepRow.getEvents();
        const rowIndex = stepRow.getOriginalIndex();
        const stepIndex = stepRow.step.stepIndex;
        const rowData = stepRow.getData();

        // Determine what data to validate
        let dataToValidate: any = rowData;
        if (config.target) {
            // Target was already hydrated, but it's a template result string
            // We need to parse it as JSON or use it to access context
            try {
                dataToValidate = JSON.parse(config.target);
            } catch {
                // If not JSON, try to get from context
                dataToValidate = stepRow.context[config.target] ?? rowData;
            }
        }

        // Validate against schema
        const valid = this.ajv.validate(config.schema, dataToValidate);
        const history = await stepRow.getPreparedMessages();

        if (valid) {
            // Emit success event

            events.emit('plugin:event', {
                row: rowIndex,
                step: stepIndex,
                plugin: 'validation',
                event: 'validation:passed',
                data: { source: 'postProcess' }
            });

            // Pass through — null data preserves existing row state
            return {
                history,
                items: [{ data: null, contentParts: [] }]
            };
        }

        // Validation failed
        const errors = this.ajv.errorsText();
        const errorDetails = this.ajv.errors;

        events.emit('plugin:event', {
            row: rowIndex,
            step: stepIndex,
            plugin: 'validation',
            event: 'validation:failed',
            data: {
                source: 'postProcess',
                errors,
                errorDetails,
                data: dataToValidate,
                schema: config.schema
            }
        });

        events.emit('step:progress', {
            row: rowIndex,
            step: stepIndex + 1,
            type: 'error',
            message: `Validation failed: ${errors}`,
            data: { errors: errorDetails }
        });

        switch (config.failMode) {
            case 'drop':
                // Return empty items to drop the row
                return {
                    history,
                    items: []
                };

            case 'error':
                throw new Error(`Validation failed: ${errors}`);

            case 'continue':
            default:
                // Return validation metadata — this gets merged into the row
                return {
                    history,
                    items: [{
                        data: {
                            _validationError: {
                                valid: false,
                                errors: errorDetails
                            }
                        },
                        contentParts: []
                    }]
                };
        }
    }
}
