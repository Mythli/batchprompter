import { Command } from 'commander';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class DedupeAdapter implements CliPluginAdapter {
    readonly pluginType = 'dedupe';

    registerOptions(program: Command) {
        program.option('--dedupe-key <template>', 'Deduplication key (Handlebars template)');
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const s = stepIndex;
        program.option(`--${s}-dedupe-key <template>`, `Deduplication key for step ${s}`);
    }

    parseOptions(options: Record<string, any>, stepIndex: number): Record<string, any> | null {
        const getOpt = (key: string) => {
            const stepKey = `${stepIndex}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
            return options[stepKey] ?? options[key];
        };

        const key = getOpt('dedupeKey');
        if (!key) return null;

        return {
            type: 'dedupe',
            key,
        };
    }
}
