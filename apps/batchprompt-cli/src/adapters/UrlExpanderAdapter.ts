import { Command } from 'commander';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class UrlExpanderAdapter implements CliPluginAdapter {
    readonly pluginType = 'url-expander';

    registerOptions(program: Command) {
        program.option('--expand-urls', 'Enable URL expansion in prompts');
        program.option('--expand-urls-mode <mode>', 'Expansion mode: fetch/puppeteer (default: fetch)');
        program.option('--expand-urls-max-chars <number>', 'Max characters per expanded URL (default: 30000)', parseInt);
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const s = stepIndex;
        program.option(`--${s}-expand-urls`, `Enable URL expansion for step ${s}`);
        program.option(`--${s}-expand-urls-mode <mode>`, `Expansion mode for step ${s}`);
        program.option(`--${s}-expand-urls-max-chars <number>`, `Max chars for step ${s}`, parseInt);
    }

    parseOptions(options: Record<string, any>, stepIndex: number): Record<string, any> | null {
        const getOpt = (key: string) => {
            const stepKey = `${stepIndex}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
            return options[stepKey] ?? options[key];
        };

        const isEnabled = getOpt('expandUrls');
        if (!isEnabled) return null;

        const result: Record<string, any> = { type: 'url-expander' };

        const mode = getOpt('expandUrlsMode');
        if (mode) result.mode = mode;

        const maxChars = getOpt('expandUrlsMaxChars');
        if (maxChars !== undefined) result.maxChars = maxChars;

        result.output = { mode: 'ignore' };

        return result;
    }
}
