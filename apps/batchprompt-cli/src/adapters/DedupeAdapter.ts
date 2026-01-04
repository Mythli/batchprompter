import { Command } from 'commander';
import { DedupePluginV2 } from 'batchprompt';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class DedupeAdapter implements CliPluginAdapter {
    constructor(public plugin: DedupePluginV2) {}

    registerOptions(program: Command) {
        program.option('--dedupe-key <template>', 'Deduplication key (Handlebars template)');
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const registerStep = (flags: string, desc: string, parser?: any) => {
            const stepFlags = flags.replace(/^(--[\w-]+)/, `$1-${stepIndex}`);
            program.option(stepFlags, `${desc} for step ${stepIndex}`, parser);
        };

        registerStep('--dedupe-key <template>', 'Deduplication key');
    }

    parseOptions(options: Record<string, any>, stepIndex: number) {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const key = getOpt('dedupeKey');
        if (!key) return null;

        return {
            type: 'dedupe',
            key,
            output: {
                mode: 'ignore',
                explode: false
            }
        };
    }
}
