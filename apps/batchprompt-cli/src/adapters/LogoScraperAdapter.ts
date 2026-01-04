import { Command } from 'commander';
import { LogoScraperPluginV2 } from 'batchprompt';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';
import { ModelFlags } from '../ModelFlags.js';

export class LogoScraperAdapter implements CliPluginAdapter {
    constructor(public plugin: LogoScraperPluginV2) {}

    registerOptions(program: Command) {
        program.option('--logo-scraper-url <url>', 'URL to scrape logos from');
        ModelFlags.register(program, 'logo-analyze', { includePrompt: true });
        ModelFlags.register(program, 'logo-extract', { includePrompt: true });
        program.option('--logo-scraper-max-candidates <number>', 'Max logo candidates to download', parseInt);
        program.option('--logo-scraper-min-score <number>', 'Min score (1-10) to keep a logo', parseInt);
        program.option('--logo-scraper-logo-path <path>', 'Path to save the best logo (supports templates)');
        program.option('--logo-scraper-favicon-path <path>', 'Path to save the best favicon (supports templates)');
        program.option('--logo-scraper-logo-limit <number>', 'Max logos to save (default: 1)', parseInt);
        program.option('--logo-scraper-favicon-limit <number>', 'Max favicons to save (default: 1)', parseInt);
        program.option('--logo-scraper-export', 'Merge results into row');
        program.option('--logo-scraper-output <column>', 'Save to column');
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const registerStep = (flags: string, desc: string, parser?: any) => {
            const stepFlags = flags.replace(/^(--[\w-]+)/, `$1-${stepIndex}`);
            program.option(stepFlags, `${desc} for step ${stepIndex}`, parser);
        };

        registerStep('--logo-scraper-url <url>', 'URL to scrape logos from');
        ModelFlags.register(program, `logo-analyze-${stepIndex}`, { includePrompt: true });
        ModelFlags.register(program, `logo-extract-${stepIndex}`, { includePrompt: true });
        registerStep('--logo-scraper-max-candidates <number>', 'Max logo candidates', parseInt);
        registerStep('--logo-scraper-min-score <number>', 'Min score', parseInt);
        registerStep('--logo-scraper-logo-path <path>', 'Path to save logo');
        registerStep('--logo-scraper-favicon-path <path>', 'Path to save favicon');
        registerStep('--logo-scraper-logo-limit <number>', 'Max logos to save', parseInt);
        registerStep('--logo-scraper-favicon-limit <number>', 'Max favicons to save', parseInt);
        registerStep('--logo-scraper-export', 'Merge results into row');
        registerStep('--logo-scraper-output <column>', 'Save to column');
    }

    parseOptions(options: Record<string, any>, stepIndex: number) {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const url = getOpt('logoScraperUrl');
        if (!url) return null;

        const analyzeConfig = ModelFlags.extractPluginModel(options, 'logoAnalyze', stepIndex);
        const extractConfig = ModelFlags.extractPluginModel(options, 'logoExtract', stepIndex);

        const exportFlag = getOpt('logoScraperExport');
        const outputColumn = getOpt('logoScraperOutput');

        let outputMode: 'merge' | 'column' | 'ignore' = 'ignore';
        if (outputColumn) outputMode = 'column';
        else if (exportFlag) outputMode = 'merge';

        return {
            type: 'logo-scraper',
            url,
            analyzeModel: analyzeConfig.model,
            analyzeTemperature: analyzeConfig.temperature,
            analyzeThinkingLevel: analyzeConfig.thinkingLevel,
            analyzePrompt: analyzeConfig.prompt,
            extractModel: extractConfig.model,
            extractTemperature: extractConfig.temperature,
            extractThinkingLevel: extractConfig.thinkingLevel,
            extractPrompt: extractConfig.prompt,
            maxCandidates: getOpt('logoScraperMaxCandidates'),
            minScore: getOpt('logoScraperMinScore'),
            logoPath: getOpt('logoScraperLogoPath'),
            faviconPath: getOpt('logoScraperFaviconPath'),
            logoLimit: getOpt('logoScraperLogoLimit'),
            faviconLimit: getOpt('logoScraperFaviconLimit'),
            output: {
                mode: outputMode,
                column: outputColumn,
                explode: false
            }
        };
    }
}
