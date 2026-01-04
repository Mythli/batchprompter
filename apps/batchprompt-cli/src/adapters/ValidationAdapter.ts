import { Command } from 'commander';
import { ValidationPluginV2 } from 'batchprompt';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class ValidationAdapter implements CliPluginAdapter {
    constructor(public plugin: ValidationPluginV2) {}

    registerOptions(program: Command) {
        program.option('--validate-schema <path>', 'JSON Schema for validation');
        program.option('--validate-target <template>', 'Data to validate (Handlebars template)');
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const registerStep = (flags: string, desc: string, parser?: any) => {
            const stepFlags = flags.replace(/^(--[\w-]+)/, `$1-${stepIndex}`);
            program.option(stepFlags, `${desc} for step ${stepIndex}`, parser);
        };

        registerStep('--validate-schema <path>', 'JSON Schema for validation');
        registerStep('--validate-target <template>', 'Data to validate');
    }

    parseOptions(options: Record<string, any>, stepIndex: number) {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const schema = getOpt('validateSchema');
        if (!schema) return null;

        return {
            type: 'validation',
            schema,
            target: getOpt('validateTarget'),
            output: {
                mode: 'ignore',
                explode: false
            }
        };
    }
}
