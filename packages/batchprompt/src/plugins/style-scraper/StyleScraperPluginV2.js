import { z } from 'zod';
import Handlebars from 'handlebars';
import { EventEmitter } from 'eventemitter3';
import { OutputConfigSchema } from '../../config/common.js';
import { InteractiveElementScreenshoter } from '../../../utils/puppeteer/InteractiveElementScreenshoter.js';
import { zHandlebars } from '../../config/validationRules.js';
// =============================================================================
// Config Schema (Single source of truth for defaults)
// =============================================================================
export const StyleScraperConfigSchemaV2 = z.object({
    type: z.literal('style-scraper').describe("Identifies this as a Style Scraper plugin."),
    id: z.string().optional().describe("Unique ID for this plugin instance."),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }).describe("How to save the scraped style data."),
    url: zHandlebars.describe("URL to scrape. Supports Handlebars."),
    resolution: z.string().default('1920x1080').describe("Viewport resolution for desktop screenshot."),
    mobile: z.boolean().default(false).describe("Capture an additional mobile screenshot (iPhone X viewport)."),
    interactive: z.boolean().default(false).describe("Find interactive elements, hover them, and capture screenshots + CSS.")
}).describe("Configuration for the Style Scraper plugin.");
// =============================================================================
// Plugin
// =============================================================================
export class StyleScraperPluginV2 {
    type = 'style-scraper';
    configSchema = StyleScraperConfigSchemaV2;
    events = new EventEmitter();
    cliOptions = [
        { flags: '--style-scrape-url <url>', description: 'URL to scrape styles from' },
        { flags: '--style-scrape-resolution <res>', description: 'Viewport resolution (default: 1920x1080)' },
        { flags: '--style-scrape-mobile', description: 'Capture mobile screenshot' },
        { flags: '--style-scrape-interactive', description: 'Capture interactive elements' },
        { flags: '--style-scraper-export', description: 'Merge results into row' },
        { flags: '--style-scraper-output <column>', description: 'Save to column' }
    ];
    getRequiredCapabilities() {
        return ['hasPuppeteer'];
    }
    parseCLIOptions(options, stepIndex) {
        const getOpt = (key) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };
        const url = getOpt('styleScrapeUrl');
        if (!url)
            return null;
        const exportFlag = getOpt('styleScraperExport');
        const outputColumn = getOpt('styleScraperOutput');
        let outputMode = 'ignore';
        if (outputColumn)
            outputMode = 'column';
        else if (exportFlag)
            outputMode = 'merge';
        // Return raw config - Zod will apply defaults
        const partialConfig = {
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
        // Parse through Zod to apply defaults
        return this.configSchema.parse(partialConfig);
    }
    async resolveConfig(rawConfig, row, inheritedModel, contentResolver) {
        const urlTemplate = Handlebars.compile(rawConfig.url, { noEscape: true });
        const url = urlTemplate(row);
        const [w, h] = rawConfig.resolution.split('x').map(Number);
        return {
            type: 'style-scraper',
            id: rawConfig.id ?? `style-scraper-${Date.now()}`,
            output: {
                mode: rawConfig.output.mode,
                column: rawConfig.output.column,
                explode: rawConfig.output.explode
            },
            url,
            resolution: { width: w || 1920, height: h || 1080 },
            mobile: rawConfig.mobile,
            interactive: rawConfig.interactive
        };
    }
    async execute(config, context) {
        const { services, outputBasename, emit } = context;
        const { puppeteerHelper } = services;
        if (!puppeteerHelper) {
            throw new Error('[StyleScraper] Puppeteer not available');
        }
        const pageHelper = await puppeteerHelper.getPageHelper();
        try {
            const cacheKey = `style-scraper:v2:${config.url}:${config.resolution.width}x${config.resolution.height}:${config.mobile}:${config.interactive}`;
            console.log(`[StyleScraper] Scraping: ${config.url}`);
            const result = await pageHelper.navigateAndCache(config.url, async (ph) => {
                const contentParts = [];
                const artifacts = [];
                const desktopShot = (await ph.takeScreenshots([config.resolution]))[0];
                if (desktopShot) {
                    contentParts.push({ type: 'text', text: `\n--- Desktop Screenshot (${config.url}) ---` });
                    contentParts.push({ type: 'image_url', image_url: { url: desktopShot.screenshotBase64 } });
                    artifacts.push({ type: 'desktop', base64: desktopShot.screenshotBase64, extension: '.jpg' });
                }
                if (config.mobile) {
                    const mobileRes = { width: 375, height: 812 };
                    const mobileShot = (await ph.takeScreenshots([mobileRes]))[0];
                    if (mobileShot) {
                        contentParts.push({ type: 'text', text: `\n--- Mobile Screenshot ---` });
                        contentParts.push({ type: 'image_url', image_url: { url: mobileShot.screenshotBase64 } });
                        artifacts.push({ type: 'mobile', base64: mobileShot.screenshotBase64, extension: '.jpg' });
                    }
                    await ph.getPage().setViewport(config.resolution);
                }
                if (config.interactive) {
                    console.log(`[StyleScraper] Capturing interactive elements...`);
                    const screenshoter = new InteractiveElementScreenshoter(puppeteerHelper);
                    const interactiveResult = await screenshoter.screenshot(ph, {
                        createCompositeImage: true,
                        maxButtons: 5,
                        maxInputs: 3,
                        maxLinks: 3
                    });
                    if (interactiveResult.compositeImageBase64) {
                        contentParts.push({ type: 'text', text: `\n--- Interactive Elements ---` });
                        contentParts.push({ type: 'image_url', image_url: { url: interactiveResult.compositeImageBase64 } });
                        artifacts.push({ type: 'interactive', base64: interactiveResult.compositeImageBase64, extension: '.png' });
                    }
                    if (interactiveResult.screenshots.length > 0) {
                        let stylesText = '\n--- Computed Styles ---\n';
                        const grouped = interactiveResult.screenshots.reduce((acc, s) => {
                            const key = `${s.type} #${s.elementIndex}`;
                            if (!acc[key])
                                acc[key] = [];
                            acc[key].push(s);
                            return acc;
                        }, {});
                        for (const [key, shots] of Object.entries(grouped)) {
                            stylesText += `\nElement: ${key}\n`;
                            for (const shot of shots) {
                                stylesText += `State: ${shot.state}\n\`\`\`css\n${shot.styles}\n\`\`\`\n`;
                                artifacts.push({
                                    type: 'element',
                                    subType: shot.type,
                                    index: shot.elementIndex,
                                    state: shot.state,
                                    base64: shot.screenshotBase64,
                                    extension: '.png'
                                });
                            }
                        }
                        contentParts.push({ type: 'text', text: stylesText });
                        artifacts.push({ type: 'css', base64: stylesText, extension: '.md' });
                    }
                }
                return { contentParts, artifacts };
            }, {
                cacheKey,
                resolution: config.resolution,
                dismissCookies: true,
                ttl: 24 * 60 * 60 * 1000
            });
            const baseName = outputBasename || 'style_scrape';
            const outputData = {};
            for (const artifact of result.artifacts) {
                let filename = '';
                let subDir = '';
                if (artifact.type === 'desktop' || artifact.type === 'mobile') {
                    subDir = 'screenshots';
                    filename = `${baseName}_${artifact.type}${artifact.extension}`;
                }
                else if (artifact.type === 'interactive') {
                    subDir = 'interactive';
                    filename = `${baseName}_composite${artifact.extension}`;
                }
                else if (artifact.type === 'css') {
                    subDir = 'css';
                    filename = `${baseName}_styles${artifact.extension}`;
                }
                else if (artifact.type === 'element') {
                    subDir = 'interactive';
                    filename = `${baseName}_${artifact.subType}_${artifact.index}_${artifact.state}${artifact.extension}`;
                }
                if (filename) {
                    emit('plugin:artifact', {
                        row: context.row.index,
                        step: context.stepIndex,
                        plugin: 'style-scraper',
                        type: artifact.type === 'css' ? 'text' : 'image',
                        filename: `style_scraper/${subDir}/${filename}`,
                        content: artifact.base64,
                        tags: ['style-scraper', artifact.type]
                    });
                    if (artifact.type === 'desktop')
                        outputData.desktop = filename;
                    if (artifact.type === 'mobile')
                        outputData.mobile = filename;
                    if (artifact.type === 'interactive')
                        outputData.interactive = filename;
                    if (artifact.type === 'css')
                        outputData.css = filename;
                    if (artifact.type === 'element') {
                        if (!outputData.elements)
                            outputData.elements = {};
                        outputData.elements[`${artifact.subType}_${artifact.index}_${artifact.state}`] = filename;
                    }
                }
            }
            return {
                packets: [{
                        data: outputData,
                        contentParts: result.contentParts
                    }]
            };
        }
        finally {
            await pageHelper.close();
        }
    }
}
//# sourceMappingURL=StyleScraperPluginV2.js.map