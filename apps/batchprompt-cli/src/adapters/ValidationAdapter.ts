import { Command } from 'commander';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class ValidationAdapter implements CliPluginAdapter {
    readonly pluginType = 'validation';

    registerOptions(program: Command) {
        program.option('--validate-schema <path>', 'JSON Schema for validation');
        program.option('--validate-target <template>', 'Data to validate (Handlebars template)');
        program.option('--validate-fail-mode <mode>', 'Fail mode: drop/error/continue (default: error)');
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const s = stepIndex;
        program.option(`--${s}-validate-schema <path>`, `Validation schema for step ${s}`);
        program.option(`--${s}-validate-target <template>`, `Validation target for step ${s}`);
        program.option(`--${s}-validate-fail-mode <mode>`, `Fail mode for step ${s}`);
    }

    parseOptions(options: Record<string, any>, stepIndex: number): Record<string, any> | null {
        const getOpt = (key: string) => {
            const stepKey = `${stepIndex}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
            return options[stepKey] ?? options[key];
        };

        const schema = getOpt('validateSchema');
        if (!schema) return null;

        const result: Record<string, any> = {
            type: 'validation',
            schema,
        };

        const target = getOpt('validateTarget');
        if (target) result.target = target;

        const failMode = getOpt('validateFailMode');
        if (failMode) result.failMode = failMode;

        return result;
    }
}
