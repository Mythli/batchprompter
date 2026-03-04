import { BasePluginRow, PluginResult, PluginItem } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { StyleScraperConfig } from './StyleScraperPlugin.js';
import { InteractiveElementScreenshoter } from '../../utils/puppeteer/InteractiveElementScreenshoter.js';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';
import * as path from 'path';

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
        const tmpDir = await stepRow.getTempDir();

        emit('plugin:event', {
            row: stepRow.getOriginalIndex(),
            step: stepRow.step.stepIndex,
            plugin: 'styleScraper',
            event: 'scraping',
            data: { url: config.url }
        });

        const screenshoter = new InteractiveElementScreenshoter(this.puppeteerHelper);
        const result = await screenshoter.screenshot(config.url, {
            maxButtons: config.maxButtons,
            maxInputs: config.maxInputs,
            maxLinks: config.maxLinks,
            createCompositeImage: config.createCompositeImage,
            scopeSelector: config.scopeSelector
        });

        // Emit artifacts
        if (result.compositeImageBase64) {
            const buffer = Buffer.from(result.compositeImageBase64.split(',')[1], 'base64');
            emit('artifact:emit', {
                row: stepRow.getOriginalIndex(),
                step: stepRow.step.stepIndex,
                source: 'styleScraper',
                type: 'image',
                filename: path.join(tmpDir, `styleScraper/composite_${Date.now()}.png`),
                content: buffer,
                tags: ['debug', 'styleScraper', 'composite']
            });
        }

        result.screenshots.forEach((shot) => {
            const buffer = Buffer.from(shot.screenshotBase64.split(',')[1], 'base64');
            emit('artifact:emit', {
                row: stepRow.getOriginalIndex(),
                step: stepRow.step.stepIndex,
                source: 'styleScraper',
                type: 'image',
                filename: path.join(tmpDir, `styleScraper/elements/${shot.type}_${shot.elementIndex}_${shot.state}_${Date.now()}.png`),
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
}
