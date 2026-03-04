import { Command } from 'commander';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class LogoScraperAdapter implements CliPluginAdapter {
    readonly pluginType = 'logoScraper';

    registerOptions(program: Command) {
        program.option('--logo-scraper-url <url>', 'URL to scrape for logos');
        program.option('--logo-scraper-max-logos <number>', 'Max logos to analyze (default: 10)', parseInt);
        program.option('--logo-scraper-threshold <number>', 'Brand logo score threshold (default: 5)', parseInt);
        program.option('--logo-scraper-analyze-model <model>', 'Model for logo analysis');
        program.option('--logo-scraper-analyze-prompt <text>', 'Prompt for logo analysis');
        program.option('--logo-scraper-extract-model <model>', 'Model for logo extraction');
        program.option('--logo-scraper-extract-prompt <text>', 'Prompt for logo extraction');
        program.option('--logo-scraper-output-mode <mode>', 'Output mode: merge/column/ignore');
        program.option('--logo-scraper-output-column <column>', 'Output column name');
        program.option('--logo-scraper-output-explode', 'Explode results into multiple rows');
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const s = stepIndex;
        program.option(`--${s}-logo-scraper-url <url>`, `URL for step ${s}`);
        program.option(`--${s}-logo-scraper-max-logos <number>`, `Max logos for step ${s}`, parseInt);
        program.option(`--${s}-logo-scraper-threshold <number>`, `Threshold for step ${s}`, parseInt);
        program.option(`--${s}-logo-scraper-analyze-model <model>`, `Analyze model for step ${s}`);
        program.option(`--${s}-logo-scraper-analyze-prompt <text>`, `Analyze prompt for step ${s}`);
        program.option(`--${s}-logo-scraper-extract-model <model>`, `Extract model for step ${s}`);
        program.option(`--${s}-logo-scraper-extract-prompt <text>`, `Extract prompt for step ${s}`);
        program.option(`--${s}-logo-scraper-output-mode <mode>`, `Output mode for step ${s}`);
        program.option(`--${s}-logo-scraper-output-column <column>`, `Output column for step ${s}`);
        program.option(`--${s}-logo-scraper-output-explode`, `Explode results for step ${s}`);
    }

    parseOptions(options: Record<string, any>, stepIndex: number): Record<string, any> | null {
        const getOpt = (key: string) => {
            const stepKey = `${stepIndex}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
            return options[stepKey] ?? options[key];
        };

        const url = getOpt('logoScraperUrl');
        if (!url) return null;

        const result: Record<string, any> = { type: 'logoScraper', url };

        if (getOpt('logoScraperMaxLogos') !== undefined) result.maxLogosToAnalyze = getOpt('logoScraperMaxLogos');
        if (getOpt('logoScraperThreshold') !== undefined) result.brandLogoScoreThreshold = getOpt('logoScraperThreshold');

        const aModel = getOpt('logoScraperAnalyzeModel');
        const aPrompt = getOpt('logoScraperAnalyzePrompt');
        if (aModel || aPrompt) {
            result.analyzeModel = {};
            if (aModel) result.analyzeModel.model = aModel;
            if (aPrompt) result.analyzeModel.prompt = aPrompt;
        }

        const eModel = getOpt('logoScraperExtractModel');
        const ePrompt = getOpt('logoScraperExtractPrompt');
        if (eModel || ePrompt) {
            result.extractModel = {};
            if (eModel) result.extractModel.model = eModel;
            if (ePrompt) result.extractModel.prompt = ePrompt;
        }

        const outputMode = getOpt('logoScraperOutputMode');
        const outputColumn = getOpt('logoScraperOutputColumn');
        const outputExplode = getOpt('logoScraperOutputExplode');
        if (outputMode || outputColumn || outputExplode) {
            result.output = {};
            if (outputMode) result.output.mode = outputMode;
            if (outputColumn) result.output.column = outputColumn;
            if (outputExplode) result.output.explode = true;
        }

        return result;
    }
}
