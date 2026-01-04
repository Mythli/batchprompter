import { Command } from 'commander';
import { UrlExpanderPlugin } from 'batchprompt';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class UrlExpanderAdapter implements CliPluginAdapter {
    constructor(public plugin: UrlExpanderPlugin) {}

    registerOptions(program: Command) {
        program.option('--expand-urls', 'Enable URL expansion in prompts');
        program.option('--expand-urls-mode <mode>', 'Expansion mode: fetch/puppeteer (default: puppeteer)');
        program.option('--expand-urls-max-chars <number>', 'Max characters per expanded URL (default: 30000)', parseInt);
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const registerStep = (flags: string, desc: string, parser?: any) => {
            const stepFlags = flags.replace(/^(--[\w-]+)/, `$1-${stepIndex}`);
            program.option(stepFlags, `${desc} for step ${stepIndex}`, parser);
        };

        registerStep('--expand-urls', 'Enable URL expansion');
        registerStep('--expand-urls-mode <mode>', 'Expansion mode');
        registerStep('--expand-urls-max-chars <number>', 'Max characters per expanded URL', parseInt);
    }

    parseOptions(options: Record<string, any>, stepIndex: number) {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const isEnabled = getOpt('expandUrls');
        if (!isEnabled) return null;

        return {
            type: 'url-expander',
            mode: getOpt('expandUrlsMode'),
            maxChars: getOpt('expandUrlsMaxChars'),
            output: {
                mode: 'ignore',
                explode: false
            }
        };
    }
}
