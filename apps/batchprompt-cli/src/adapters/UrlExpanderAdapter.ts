import { Command } from 'commander';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class UrlExpanderAdapter implements CliPluginAdapter {
    readonly pluginType = 'urlExpander';

    registerOptionsForStep(program: Command, stepIndex: number) {
        const s = stepIndex;
        program.option(`--${s}-expand-urls`, `Enable URL expansion for step ${s}`);
        program.option(`--${s}-expand-urls-mode <mode>`, `Expansion mode for step ${s}`);
        program.option(`--${s}-expand-urls-max-chars <number>`, `Max chars for step ${s}`, parseInt);
    }

    parseStepOptions(options: Record<string, any>, stepIndex: number): Record<string, any> | null {
        const getOpt = (key: string) => {
            const stepKey = `${stepIndex}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
            return options[stepKey];
        };

        const isEnabled = getOpt('expandUrls');
        if (!isEnabled) return null;

        const expandUrls: Record<string, any> = {};

        const mode = getOpt('expandUrlsMode');
        if (mode) expandUrls.mode = mode;

        const maxChars = getOpt('expandUrlsMaxChars');
        if (maxChars !== undefined) expandUrls.maxChars = maxChars;

        return {
            expandUrls: Object.keys(expandUrls).length > 0 ? expandUrls : true
        };
    }

    parseOptions(): Record<string, any> | null {
        return null;
    }
}
