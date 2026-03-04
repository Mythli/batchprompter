import { Command } from 'commander';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class StyleScraperAdapter implements CliPluginAdapter {
    readonly pluginType = 'styleScraper';

    registerOptions(program: Command) {
        program.option('--style-scraper-url <url>', 'URL to scrape for styles');
        program.option('--style-scraper-max-buttons <number>', 'Max buttons to scrape', parseInt);
        program.option('--style-scraper-max-inputs <number>', 'Max inputs to scrape', parseInt);
        program.option('--style-scraper-max-links <number>', 'Max links to scrape', parseInt);
        program.option('--style-scraper-scope-selector <selector>', 'CSS selector to scope the search');
        program.option('--style-scraper-no-composite', 'Disable composite image creation');
        program.option('--style-scraper-output-mode <mode>', 'Output mode: merge/column/ignore');
        program.option('--style-scraper-output-column <column>', 'Output column name');
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const s = stepIndex;
        program.option(`--${s}-style-scraper-url <url>`, `URL for step ${s}`);
        program.option(`--${s}-style-scraper-max-buttons <number>`, `Max buttons for step ${s}`, parseInt);
        program.option(`--${s}-style-scraper-max-inputs <number>`, `Max inputs for step ${s}`, parseInt);
        program.option(`--${s}-style-scraper-max-links <number>`, `Max links for step ${s}`, parseInt);
        program.option(`--${s}-style-scraper-scope-selector <selector>`, `Scope selector for step ${s}`);
        program.option(`--${s}-style-scraper-no-composite`, `Disable composite image for step ${s}`);
        program.option(`--${s}-style-scraper-output-mode <mode>`, `Output mode for step ${s}`);
        program.option(`--${s}-style-scraper-output-column <column>`, `Output column for step ${s}`);
    }

    parseOptions(options: Record<string, any>, stepIndex: number): Record<string, any> | null {
        const getOpt = (key: string) => {
            const stepKey = `${stepIndex}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
            return options[stepKey] ?? options[key];
        };

        const url = getOpt('styleScraperUrl');
        if (!url) return null;

        const result: Record<string, any> = { type: 'styleScraper', url };

        if (getOpt('styleScraperMaxButtons') !== undefined) result.maxButtons = getOpt('styleScraperMaxButtons');
        if (getOpt('styleScraperMaxInputs') !== undefined) result.maxInputs = getOpt('styleScraperMaxInputs');
        if (getOpt('styleScraperMaxLinks') !== undefined) result.maxLinks = getOpt('styleScraperMaxLinks');
        if (getOpt('styleScraperScopeSelector')) result.scopeSelector = getOpt('styleScraperScopeSelector');
        if (getOpt('styleScraperNoComposite')) result.createCompositeImage = false;

        const outputMode = getOpt('styleScraperOutputMode');
        const outputColumn = getOpt('styleScraperOutputColumn');
        if (outputMode || outputColumn) {
            result.output = {};
            if (outputMode) result.output.mode = outputMode;
            if (outputColumn) result.output.column = outputColumn;
        }

        return result;
    }
}
