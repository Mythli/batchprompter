import { Command } from 'commander';
import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import { ContentProviderPlugin, PluginContext } from '../types.js';
import { InteractiveElementScreenshoter } from '../../utils/puppeteer/InteractiveElementScreenshoter.js';
import { ArtifactSaver } from '../../ArtifactSaver.js';
import { ensureDir } from '../../utils/fileUtils.js';

interface StyleScraperRawConfig {
    url?: string;
    resolution: string;
    mobile: boolean;
    interactive: boolean;
}

interface StyleScraperResolvedConfig {
    url: string;
    resolution: { width: number, height: number };
    mobile: boolean;
    interactive: boolean;
}

export class StyleScraperPlugin implements ContentProviderPlugin {
    name = 'style-scraper';

    constructor() {}

    register(program: Command): void {
        program.option('--style-scrape-url <url>', 'Target URL for style scraping');
        program.option('--style-scrape-resolution <res>', 'Viewport resolution (e.g. 1920x1080)', '1920x1080');
        program.option('--style-scrape-mobile', 'Capture mobile screenshot as well', false);
        program.option('--style-scrape-interactive', 'Capture interactive elements and styles', false);
    }

    registerStep(program: Command, stepIndex: number): void {
        program.option(`--style-scrape-url-${stepIndex} <url>`, `Target URL for step ${stepIndex}`);
        program.option(`--style-scrape-resolution-${stepIndex} <res>`, `Viewport resolution for step ${stepIndex}`);
        program.option(`--style-scrape-mobile-${stepIndex}`, `Capture mobile screenshot for step ${stepIndex}`);
        program.option(`--style-scrape-interactive-${stepIndex}`, `Capture interactive elements for step ${stepIndex}`);
    }

    normalize(options: Record<string, any>, stepIndex: number, globalConfig: any): StyleScraperRawConfig | undefined {
        const getOpt = (key: string) => {
            const specific = options[`${key}${stepIndex}`];
            if (specific !== undefined) return specific;
            return options[key];
        };

        const url = getOpt('styleScrapeUrl');
        if (!url) return undefined;

        return {
            url,
            resolution: getOpt('styleScrapeResolution') || '1920x1080',
            mobile: !!getOpt('styleScrapeMobile'),
            interactive: !!getOpt('styleScrapeInteractive')
        };
    }

    async prepare(config: StyleScraperRawConfig, row: Record<string, any>): Promise<StyleScraperResolvedConfig> {
        const urlTemplate = config.url || '';
        const url = Handlebars.compile(urlTemplate, { noEscape: true })(row);

        const [w, h] = config.resolution.split('x').map(Number);
        const resolution = { width: w || 1920, height: h || 1080 };

        return {
            url,
            resolution,
            mobile: config.mobile,
            interactive: config.interactive
        };
    }

    async execute(context: PluginContext): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        const { row, stepIndex, config, services, tempDirectory, outputBasename } = context;
        const resolvedConfig = config as StyleScraperResolvedConfig;

        if (!services.puppeteerHelper) {
            throw new Error("PuppeteerHelper is not available.");
        }

        const puppeteerHelper = services.puppeteerHelper;
        const pageHelper = await puppeteerHelper.getPageHelper();

        try {
            console.log(`[Row ${context.row.index}] Step ${stepIndex} Scraping styles from: ${resolvedConfig.url}`);

            // Navigate
            await pageHelper.navigateToUrl(resolvedConfig.url, {
                resolution: resolvedConfig.resolution,
                dismissCookies: true
            });

            const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
            const baseName = outputBasename || 'style_scrape';
            const assetsDir = path.join(tempDirectory, 'style_assets');
            await ensureDir(assetsDir);

            // 1. Desktop Screenshot
            const desktopShot = (await pageHelper.takeScreenshots([resolvedConfig.resolution]))[0];
            if (desktopShot) {
                const filename = `${baseName}_desktop.jpg`;
                const savePath = path.join(assetsDir, filename);
                await ArtifactSaver.save(desktopShot.screenshotBase64, savePath);
                
                contentParts.push({ type: 'text', text: `\n--- Desktop Screenshot (${resolvedConfig.url}) ---` });
                contentParts.push({ type: 'image_url', image_url: { url: desktopShot.screenshotBase64 } });
            }

            // 2. Mobile Screenshot (Optional)
            if (resolvedConfig.mobile) {
                const mobileRes = { width: 375, height: 812 };
                const mobileShot = (await pageHelper.takeScreenshots([mobileRes]))[0];
                if (mobileShot) {
                    const filename = `${baseName}_mobile.jpg`;
                    const savePath = path.join(assetsDir, filename);
                    await ArtifactSaver.save(mobileShot.screenshotBase64, savePath);

                    contentParts.push({ type: 'text', text: `\n--- Mobile Screenshot ---` });
                    contentParts.push({ type: 'image_url', image_url: { url: mobileShot.screenshotBase64 } });
                }
                // Restore viewport
                await pageHelper.getPage().setViewport(resolvedConfig.resolution);
            }

            // 3. Interactive Elements (Optional)
            if (resolvedConfig.interactive) {
                console.log(`[Row ${context.row.index}] Step ${stepIndex} Capturing interactive elements...`);
                const screenshoter = new InteractiveElementScreenshoter(puppeteerHelper);
                
                // We pass the existing pageHelper to avoid re-navigation
                const result = await screenshoter.screenshot(pageHelper, {
                    createCompositeImage: true,
                    maxButtons: 5,
                    maxInputs: 3,
                    maxLinks: 3
                });

                if (result.compositeImageBase64) {
                    const filename = `${baseName}_interactive.png`;
                    const savePath = path.join(assetsDir, filename);
                    await ArtifactSaver.save(result.compositeImageBase64, savePath);

                    contentParts.push({ type: 'text', text: `\n--- Interactive Elements Composite ---` });
                    contentParts.push({ type: 'image_url', image_url: { url: result.compositeImageBase64 } });
                }

                if (result.screenshots.length > 0) {
                    let stylesText = "\n--- Computed Styles for Interactive Elements ---\n";
                    
                    // Group by type
                    const grouped = result.screenshots.reduce((acc, s) => {
                        const key = `${s.type} #${s.elementIndex}`;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(s);
                        return acc;
                    }, {} as Record<string, typeof result.screenshots>);

                    for (const [key, shots] of Object.entries(grouped)) {
                        stylesText += `\nElement: ${key}\n`;
                        for (const shot of shots) {
                            stylesText += `State: ${shot.state}\n\`\`\`css\n${shot.styles}\n\`\`\`\n`;
                        }
                    }
                    contentParts.push({ type: 'text', text: stylesText });
                }
            }

            return contentParts;

        } finally {
            await pageHelper.close();
        }
    }
}
