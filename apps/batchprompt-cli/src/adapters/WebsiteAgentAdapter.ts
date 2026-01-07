import { Command } from 'commander';
import { WebsiteAgentPluginV2 } from 'batchprompt';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';
import { ModelFlags } from '../ModelFlags.js';

export class WebsiteAgentAdapter implements CliPluginAdapter {
    constructor(public plugin: WebsiteAgentPluginV2) {}

    registerOptions(program: Command) {
        ModelFlags.register(program, 'website-navigator', { includePrompt: true, includeSystem: true });
        ModelFlags.register(program, 'website-extract', { includePrompt: true, includeSystem: true });
        ModelFlags.register(program, 'website-merge', { includePrompt: true, includeSystem: true });

        program.option('--website-agent-url <url>', 'Starting URL to scrape');
        program.option('--website-agent-schema <path>', 'JSON Schema for extraction');
        program.option('--website-agent-budget <number>', 'Max pages to visit (default: 10)', parseInt);
        program.option('--website-agent-batch-size <number>', 'Pages per batch (default: 3)', parseInt);
        program.option('--website-agent-export', 'Merge results into row');
        program.option('--website-agent-output <column>', 'Save to column');
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const registerStep = (flags: string, desc: string, parser?: any) => {
            const stepFlags = flags.replace(/^(--[\w-]+)/, `$1-${stepIndex}`);
            program.option(stepFlags, `${desc} for step ${stepIndex}`, parser);
        };

        ModelFlags.register(program, `website-navigator-${stepIndex}`, { includePrompt: true, includeSystem: true });
        ModelFlags.register(program, `website-extract-${stepIndex}`, { includePrompt: true, includeSystem: true });
        ModelFlags.register(program, `website-merge-${stepIndex}`, { includePrompt: true, includeSystem: true });

        registerStep('--website-agent-url <url>', 'Starting URL to scrape');
        registerStep('--website-agent-schema <path>', 'JSON Schema for extraction');
        registerStep('--website-agent-budget <number>', 'Max pages to visit', parseInt);
        registerStep('--website-agent-batch-size <number>', 'Pages per batch', parseInt);
        registerStep('--website-agent-export', 'Merge results into row');
        registerStep('--website-agent-output <column>', 'Save to column');
    }

    parseOptions(options: Record<string, any>, stepIndex: number) {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const url = getOpt('websiteAgentUrl');
        if (!url) return null;

        const navigatorConfig = ModelFlags.extractPluginModel(options, 'websiteNavigator', stepIndex);
        const extractConfig = ModelFlags.extractPluginModel(options, 'websiteExtract', stepIndex);
        const mergeConfig = ModelFlags.extractPluginModel(options, 'websiteMerge', stepIndex);

        const exportFlag = getOpt('websiteAgentExport');
        const outputColumn = getOpt('websiteAgentOutput');

        let outputMode: 'merge' | 'column' | 'ignore' = 'ignore';
        if (outputColumn) outputMode =