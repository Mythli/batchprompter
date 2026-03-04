import { z } from 'zod';
import Handlebars from 'handlebars';
import { BasePlugin, BasePluginRow } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { PartialOutputConfigSchema, StepConfig, GlobalConfig } from '../../config/schema.js';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';
import { StyleScraperPluginRow } from './StyleScraperPluginRow.js';

export const StyleScraperConfigSchemaV2 = z.object({
    type: z.literal('styleScraper'),
    id: z.string().optional(),
    output: PartialOutputConfigSchema.optional(),
    url: z.string().describe("The URL to scrape styles from."),
    maxButtons: z.number().int().min(0).default(3).describe("Maximum number of buttons to interact with."),
    maxInputs: z.number().int().min(0).default(3).describe("Maximum number of inputs to interact with."),
    maxLinks: z.number().int().min(0).default(3).describe("Maximum number of links to interact with."),
    createCompositeImage: z.boolean().default(true).describe("Whether to generate a composite image of all states."),
    scopeSelector: z.string().optional().describe("Optional CSS selector to restrict the search area.")
}).strict();

export type StyleScraperConfig = z.output<typeof StyleScraperConfigSchemaV2>;

export class StyleScraperPlugin extends BasePlugin<StyleScraperConfig, StyleScraperConfig> {
    readonly type = 'styleScraper';

    constructor(
        private deps: {
            puppeteerHelper: PuppeteerHelper;
        }
    ) {
        super();
    }

    getSchema() {
        return StyleScraperConfigSchemaV2;
    }

    normalizeConfig(config: StyleScraperConfig, stepConfig: StepConfig, globalConfig: GlobalConfig): StyleScraperConfig {
        const base = super.normalizeConfig(config, stepConfig, globalConfig);

        return {
            ...base,
            id: config.id ?? `styleScraper-${Date.now()}`,
        };
    }

    async hydrate(_stepConfig: StepConfig, _globalConfig: GlobalConfig, config: StyleScraperConfig, context: Record<string, any>): Promise<StyleScraperConfig> {
        const urlTemplate = Handlebars.compile(config.url, { noEscape: true });
        const url = urlTemplate(context);

        let scopeSelector = config.scopeSelector;
        if (scopeSelector) {
            const scopeTemplate = Handlebars.compile(scopeSelector, { noEscape: true });
            scopeSelector = scopeTemplate(context);
        }

        return {
            ...config,
            url,
            scopeSelector
        };
    }

    createRow(stepRow: StepRow, config: StyleScraperConfig): BasePluginRow<StyleScraperConfig> {
        return new StyleScraperPluginRow(stepRow, config, this.deps.puppeteerHelper);
    }
}
