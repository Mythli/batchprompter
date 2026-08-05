import { Command } from 'commander';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class LoadDataAdapter implements CliPluginAdapter {
    readonly pluginType = 'loadData';

    registerOptionsForStep(program: Command, stepIndex: number) {
        const s = stepIndex;
        program.option(`--${s}-load-data-file <path>`, `File to load for step ${s}`);
        program.option(`--${s}-load-data-json <json>`, `JSON array for step ${s}`);
        program.option(`--${s}-load-data-output-mode <mode>`, `Output mode for step ${s}`);
        program.option(`--${s}-load-data-output-column <column>`, `Output column for step ${s}`);
        program.option(`--${s}-load-data-output-explode`, `Explode loaded data for step ${s}`);
    }

    parseOptions(options: Record<string, any>, stepIndex: number): Record<string, any> | null {
        const getOpt = (key: string) => {
            const stepKey = `${stepIndex}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
            return options[stepKey];
        };

        const file = getOpt('loadDataFile');
        const jsonStr = getOpt('loadDataJson');

        if (!file && !jsonStr) return null;

        const result: Record<string, any> = { type: 'loadData' };

        if (file) result.file = file;
        if (jsonStr) {
            try {
                result.data = JSON.parse(jsonStr);
            } catch (e: any) {
                throw new Error(`Failed to parse --load-data-json: ${e.message}`);
            }
        }

        const outputMode = getOpt('loadDataOutputMode');
        const outputColumn = getOpt('loadDataOutputColumn');
        const outputExplode = getOpt('loadDataOutputExplode');
        if (outputMode || outputColumn || outputExplode) {
            result.output = {};
            if (outputMode) result.output.mode = outputMode;
            if (outputColumn) result.output.column = outputColumn;
            if (outputExplode) result.output.explode = true;
        }

        return result;
    }
}
