import { Command } from 'commander';
import { StyleScraperPluginV2 } from 'batchprompt';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class StyleScraperAdapter implements CliPluginAdapter {
    constructor(public plugin: StyleScraperPluginV2) {}

    registerOptions(program: Command) {
        program.option('--style-scrape-url <url>', 'URL to scrape styles from');
        program.option('--style-scrape-resolution <res>', 'Viewport resolution (default: 1920x1080)');
        program.option('--style-scrape-mobile', 'Capture mobile screenshot');
        program.option('--style-scrape-interactive', 'Capture interactive elements');
        program.option('--style-scraper-export', 'Merge results into row');
        program.option('--style-scraper-output <column>', 'Save to column');
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const registerStep = (flags: string, desc: string, parser?: any) => {
            const stepFlags = flags.replace(/^(--[\w-]+)/, `$1-${stepIndex}`);
            program.option(stepFlags, `${desc} for step ${stepIndex}`, parser);
        };

        registerStep('--style-scrape-url <url>', 'URL to scrape styles from');
        registerStep('--style-scrape-resolution <res>', 'Viewport resolution');
        registerStep('--style-scrape-mobile', 'Capture mobile screenshot');
        registerStep('--style-scrape-interactive', 'Capture interactive elements');
        registerStep('--style-scraper-export', 'Merge results into row');
        registerStep('--style-scraper-output <column>', 'Save to column');
    }

    parseOptions(options: Record<string, any>, stepIndex: number) {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const url = getOpt('styleScrapeUrl');
        if (!url) return null;

        const exportFlag = getOpt('styleScraperExport');
        const outputColumn = getOpt('styleScraperOutput');

        let outputMode: 'merge' | 'column' | 'ignore' = 'ignore';
        if (outputColumn) outputMode = 'column';
        else if (exportFlag) outputMode = 'merge';

        return {
            type: 'style-scraper',
            url,
            resolution: getOpt('styleScrapeResolution'),
            mobile: getOpt('styleScrapeMobile'),
            interactive: getOpt('styleScrapeInteractive'),
            output: {
                mode: outputMode,
                column: outputColumn,
                explode: false
            }
        };
    }
}
