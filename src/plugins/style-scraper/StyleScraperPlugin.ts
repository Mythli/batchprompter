import { Command } from 'commander';
import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import { ContentProviderPlugin, PluginContext, PluginResult, NormalizedPluginConfig } from '../types.js';
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

interface ScraperArtifact {
    type: 'desktop' | 'mobile' | 'interactive_composite' | 'element' | 'css';
    subType?: string; // e.g. 'button', 'input'
    index?: number;
    state?: string;
    base64: string;
    extension: string;
}

interface StyleScraperCacheData {
    contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    artifacts: ScraperArtifact[];
}

// Strongly typed output for the plugin
export interface StyleScraperOutput {
    desktop?: string;
    mobile?: string;
    interactive?: string;
    css?: string;
    elements?: Record<string, string>; // Keyed by "type_index_state" e.g. "button_1_hover"
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

    normalize(options: Record<string, any>, stepIndex: number, globalConfig: any): NormalizedPluginConfig | undefined {
        const getOpt = (key: string) => {
            const specific = options[`${key}${stepIndex}`];
            if (specific !== undefined) return specific;
            return options[key];
        };

        const url = getOpt('styleScrapeUrl');
        if (!url) return undefined;

        const config: StyleScraperRawConfig = {
            url,
            resolution: getOpt('styleScrapeResolution') || '1920x1080',
            mobile: !!getOpt('styleScrapeMobile'),
            interactive: !!getOpt('styleScrapeInteractive')
        };

        return {
            config
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

    async execute(context: PluginContext): Promise<PluginResult> {
        const { row, stepIndex, config, services, tempDirectory, outputBasename } = context;
        const resolvedConfig = config as StyleScraperResolvedConfig;

        if (!services.puppeteerHelper) {
            throw new Error("PuppeteerHelper is not available.");
        }

        const puppeteerHelper = services.puppeteerHelper;
        const pageHelper = await puppeteerHelper.getPageHelper();

        try {
            // Construct a unique cache key
            const cacheKey = `style-scraper:v2:${resolvedConfig.url}:${resolvedConfig.resolution.width}x${resolvedConfig.resolution.height}:${resolvedConfig.mobile}:${resolvedConfig.interactive}`;

            console.log(`[Row ${context.row.index}] Step ${stepIndex} Scraping styles from: ${resolvedConfig.url}`);

            const result = await pageHelper.navigateAndCache<StyleScraperCacheData>(
                resolvedConfig.url,
                async (ph) => {
                    const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
                    const artifacts: ScraperArtifact[] = [];

                    // 1. Desktop Screenshot
                    const desktopShot = (await ph.takeScreenshots([resolvedConfig.resolution]))[0];
                    if (desktopShot) {
                        contentParts.push({ type: 'text', text: `\n--- Desktop Screenshot (${resolvedConfig.url}) ---` });
                        contentParts.push({ type: 'image_url', image_url: { url: desktopShot.screenshotBase64 } });
                        
                        artifacts.push({
                            type: 'desktop',
                            base64: desktopShot.screenshotBase64,
                            extension: '.jpg'
                        });
                    }

                    // 2. Mobile Screenshot (Optional)
                    if (resolvedConfig.mobile) {
                        const mobileRes = { width: 375, height: 812 };
                        const mobileShot = (await ph.takeScreenshots([mobileRes]))[0];
                        if (mobileShot) {
                            contentParts.push({ type: 'text', text: `\n--- Mobile Screenshot ---` });
                            contentParts.push({ type: 'image_url', image_url: { url: mobileShot.screenshotBase64 } });

                            artifacts.push({
                                type: 'mobile',
                                base64: mobileShot.screenshotBase64,
                                extension: '.jpg'
                            });
                        }
                        // Restore viewport
                        await ph.getPage().setViewport(resolvedConfig.resolution);
                    }

                    // 3. Interactive Elements (Optional)
                    if (resolvedConfig.interactive) {
                        console.log(`[Row ${context.row.index}] Step ${stepIndex} Capturing interactive elements...`);
                        const screenshoter = new InteractiveElementScreenshoter(puppeteerHelper);
                        
                        const interactiveResult = await screenshoter.screenshot(ph, {
                            createCompositeImage: true,
                            maxButtons: 5,
                            maxInputs: 3,
                            maxLinks: 3
                        });

                        if (interactiveResult.compositeImageBase64) {
                            contentParts.push({ type: 'text', text: `\n--- Interactive Elements Composite ---` });
                            contentParts.push({ type: 'image_url', image_url: { url: interactiveResult.compositeImageBase64 } });

                            artifacts.push({
                                type: 'interactive_composite',
                                base64: interactiveResult.compositeImageBase64,
                                extension: '.png'
                            });
                        }

                        if (interactiveResult.screenshots.length > 0) {
                            let stylesText = "\n--- Computed Styles for Interactive Elements ---\n";
                            
                            const grouped = interactiveResult.screenshots.reduce((acc, s) => {
                                const key = `${s.type} #${s.elementIndex}`;
                                if (!acc[key]) acc[key] = [];
                                acc[key].push(s);
                                return acc;
                            }, {} as Record<string, typeof interactiveResult.screenshots>);

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

                            artifacts.push({
                                type: 'css',
                                base64: stylesText,
                                extension: '.md'
                            });
                        }
                    }

                    return { contentParts, artifacts };
                },
                {
                    cacheKey,
                    resolution: resolvedConfig.resolution,
                    dismissCookies: true,
                    ttl: 24 * 60 * 60 * 1000 // 24 hours
                }
            );

            // --- Post-Processing ---
            const baseName = outputBasename || 'style_scrape';
            const screenshotsDir = path.join(tempDirectory, 'screenshots');
            const interactiveDir = path.join(tempDirectory, 'interactive');
            const elementsDir = path.join(interactiveDir, 'elements');

            await ensureDir(screenshotsDir);
            if (resolvedConfig.interactive) {
                await ensureDir(interactiveDir);
                await ensureDir(elementsDir);
            }

            const outputData: StyleScraperOutput = {};

            for (const artifact of result.artifacts) {
                let savePath = '';
                
                if (artifact.type === 'desktop') {
                    savePath = path.join(screenshotsDir, `${baseName}_desktop${artifact.extension}`);
                    outputData.desktop = savePath;
                } else if (artifact.type === 'mobile') {
                    savePath = path.join(screenshotsDir, `${baseName}_mobile${artifact.extension}`);
                    outputData.mobile = savePath;
                } else if (artifact.type === 'interactive_composite') {
                    savePath = path.join(interactiveDir, `${baseName}_interactive${artifact.extension}`);
                    outputData.interactive = savePath;
                } else if (artifact.type === 'css') {
                    savePath = path.join(interactiveDir, `${baseName}_styles${artifact.extension}`);
                    outputData.css = savePath;
                } else if (artifact.type === 'element') {
                    const filename = `${baseName}_${artifact.subType}_${artifact.index}_${artifact.state}${artifact.extension}`;
                    savePath = path.join(elementsDir, filename);
                    
                    if (!outputData.elements) outputData.elements = {};
                    const key = `${artifact.subType}_${artifact.index}_${artifact.state}`;
                    outputData.elements[key] = savePath;
                }

                if (savePath) {
                    await ArtifactSaver.save(artifact.base64, savePath);
                }
            }

            return {
                contentParts: result.contentParts,
                data: [outputData] // Wrap in array to signify 1:1 mapping
            };

        } finally {
            await pageHelper.close();
        }
    }
}
