import { BasePluginRow, PluginResult, PluginItem } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { StyleScraperConfig } from './StyleScraperPlugin.js';
import { WebsiteStyleScraper } from 'ai-brand-scraper';
import type { PageActionExecutor } from 'ai-brand-scraper';
import type { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';

export class StyleScraperPluginRow extends BasePluginRow<StyleScraperConfig> {
    constructor(
        stepRow: StepRow,
        config: StyleScraperConfig,
        private puppeteerHelper: PuppeteerHelper
    ) {
        super(stepRow, config);
    }

    async prepare(): Promise<PluginResult> {
        const { stepRow, config } = this;
        const emit = stepRow.step.deps.events.emit.bind(stepRow.step.deps.events);

        emit('plugin:event', {
            row: stepRow.getOriginalIndex(),
            step: stepRow.step.stepIndex,
            plugin: 'styleScraper',
            event: 'scraping',
            data: { url: config.url }
        });

        const styleScraper = new WebsiteStyleScraper({
            pageExecutor: this.createPageExecutor()
        });
        const result = await styleScraper.scrape({
            url: config.url,
            maxButtons: config.maxButtons,
            maxInputs: config.maxInputs,
            maxLinks: config.maxLinks,
            createCompositeImage: config.createCompositeImage,
            scopeSelector: config.scopeSelector
        });

        // Emit artifacts
        if (result.compositeImageBase64) {
            const buffer = Buffer.from(result.compositeImageBase64.split(',')[1], 'base64');
            this.emitTmpArtifact({
                type: 'image',
                filename: `styleScraper/composite_${Date.now()}.png`,
                content: buffer,
                tags: ['debug', 'styleScraper', 'composite']
            });
        }

        result.screenshots.forEach((shot) => {
            const buffer = Buffer.from(shot.screenshotBase64.split(',')[1], 'base64');
            this.emitTmpArtifact({
                type: 'image',
                filename: `styleScraper/elements/${shot.type}_${shot.elementIndex}_${shot.state}_${Date.now()}.png`,
                content: buffer,
                tags: ['debug', 'styleScraper', 'element']
            });
        });

        const history = await stepRow.getPreparedMessages();

        if (result.screenshots.length === 0) {
            return {
                history,
                items: [{ data: { elements: [] }, contentParts: [{ type: 'text', text: 'No interactive elements found.' }] }]
            };
        }

        // Build data without base64 to save memory in the final JSON output
        const elementsData = result.screenshots.map(s => ({
            type: s.type,
            state: s.state,
            elementIndex: s.elementIndex,
            styles: s.styles
        }));

        const contentParts: any[] = [];
        
        let stylesText = "Extracted Interactive Element Styles:\n\n";
        elementsData.forEach(el => {
            stylesText += `--- ${el.type} #${el.elementIndex} (${el.state}) ---\n${el.styles}\n\n`;
        });
        contentParts.push({ type: 'text', text: stylesText });

        if (result.compositeImageBase64) {
            contentParts.push({ type: 'image_url', image_url: { url: result.compositeImageBase64 } });
        }

        return {
            history,
            items: [{
                data: { elements: elementsData },
                contentParts
            }]
        };
    }

    private createPageExecutor(): PageActionExecutor {
        return {
            executeOnPage: async ({ url, cacheKey, ttl, navigation, beforeNavigate, action }) => {
                const pageHelper = await this.puppeteerHelper.getPageHelper();
                return pageHelper.navigateAndCache(
                    url,
                    async (helper) => action(helper.getPage() as any),
                    {
                        ...navigation,
                        cacheKey,
                        ttl,
                        closePage: true,
                        beforeNavigate: beforeNavigate
                            ? async (helper) => beforeNavigate(helper.getPage() as any)
                            : undefined,
                    }
                );
            },
        };
    }
}
