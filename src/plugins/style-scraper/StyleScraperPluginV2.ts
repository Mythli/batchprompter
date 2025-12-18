import { z } from 'zod';
import Handlebars from 'handlebars';
import path from 'path';
import OpenAI from 'openai';
import {
    Plugin,
    PluginExecutionContext,
    PluginResult,
    CLIOptionDefinition
} from '../types.js';
import { ServiceCapabilities, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema } from '../../config/schema.js';
import { InteractiveElementScreenshoter } from '../../utils/puppeteer/InteractiveElementScreenshoter.js';
import { ArtifactSaver } from '../../ArtifactSaver.js';
import { ensureDir } from '../../utils/fileUtils.js';

// =============================================================================
// Config Schema (Single source of truth for defaults)
// =============================================================================

export const StyleScraperConfigSchemaV2 = z.object({
    type: z.literal('style-scraper'),
    id: z.string().optional(),
    output: OutputConfigSchema.default({}),
    url: z.string(),
    resolution: z.string().default('1920x1080'),
    mobile: z.boolean().default(false),
    interactive: z.boolean().default(false)
});

export type StyleScraperRawConfigV2 = z.infer<typeof StyleScraperConfigSchemaV2>;

export interface StyleScraperResolvedConfigV2 {
    type: 'style-scraper';
    id: string;
    output: ResolvedOutputConfig;
    url: string;
    resolution: { width: number; height: number };
    mobile: boolean;
    interactive: boolean;
}

// =============================================================================
// Plugin
// =============================================================================

export class StyleScraperPluginV2 implements Plugin<StyleScraperRawConfigV2, StyleScraperResolvedConfigV2> {
    readonly type = 'style-scraper';
    readonly configSchema = StyleScraperConfigSchemaV2;

    readonly cliOptions: CLIOptionDefinition[] = [
        { flags: '--style-scrape-url <url>', description: 'URL to scrape styles from' },
        { flags: '--style-scrape-resolution <res>', description: 'Viewport resolution (default: 1920x1080)' },
        { flags: '--style-scrape-mobile', description: 'Capture mobile screenshot' },
        { flags: '--style-scrape-interactive', description: 'Capture interactive elements' },
        { flags: '--style-scraper-export', description: 'Merge results into row' },
        { flags: '--style-scraper-output <column>', description: 'Save to column' }
    ];

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return ['hasPuppeteer'];
    }

    parseCLIOptions(options: Record<string, any>, stepIndex: number): StyleScraperRawConfigV2 | null {
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

        // Return raw config - Zod will apply defaults
        const rawConfig = {
            type: 'style-scraper' as const,
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
        return this.configSchema.parse(rawConfig);
    }

    async resolveConfig(
        rawConfig: StyleScraperRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
    ): Promise<StyleScraperResolvedConfigV2> {
        const urlTemplate = Handlebars.compile(rawConfig.url, { noEscape: true });
        const url = urlTemplate(row);

        const [w, h] = rawConfig.resolution.split('x').map(Number);

        return {
            type: 'style-scraper',
            id: rawConfig.id ?? `style-scraper-${Date.now()}`,
            output: {
                mode: rawConfig.output?.mode,
                column: rawConfig.output?.column,
                explode: rawConfig.output?.explode
            },
            url,
            resolution: { width: w || 1920, height: h || 1080 },
            mobile: rawConfig.mobile,
            interactive: rawConfig.interactive
        };
    }

    async execute(
        config: StyleScraperResolvedConfigV2,
        context: PluginExecutionContext
    ): Promise<PluginResult> {
        const { services, tempDirectory, outputBasename } = context;
        const { puppeteerHelper } = services;

        if (!puppeteerHelper) {
            throw new Error('[StyleScraper] Puppeteer not available');
        }

        const pageHelper = await puppeteerHelper.getPageHelper();

        try {
            const cacheKey = `style-scraper:v2:${config.url}:${config.resolution.width}x${config.resolution.height}:${config.mobile}:${config.interactive}`;

            console.log(`[StyleScraper] Scraping: ${config.url}`);

            interface Artifact {
                type: string;
                subType?: string;
                index?: number;
                state?: string;
                base64: string;
                extension: string;
            }

            const result = await pageHelper.navigateAndCache<{ contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[]; artifacts: Artifact[] }>(
                config.url,
                async (ph) => {
                    const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
                    const artifacts: Artifact[] = [];

                    // Desktop screenshot
                    const desktopShot = (await ph.takeScreenshots([config.resolution]))[0];
                    if (desktopShot) {
                        contentParts.push({ type: 'text', text: `\n--- Desktop Screenshot (${config.url}) ---` });
                        contentParts.push({ type: 'image_url', image_url: { url: desktopShot.screenshotBase64 } });
                        artifacts.push({ type: 'desktop', base64: desktopShot.screenshotBase64, extension: '.jpg' });
                    }

                    // Mobile screenshot
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

                    // Interactive elements
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
                            artifacts.push({ type: 'css', base64: stylesText, extension: '.md' });
                        }
                    }

                    return { contentParts, artifacts };
                },
                {
                    cacheKey,
                    resolution: config.resolution,
                    dismissCookies: true,
                    ttl: 24 * 60 * 60 * 1000
                }
            );

            // Save artifacts
            const baseName = outputBasename || 'style_scrape';
            const screenshotsDir = path.join(tempDirectory, 'screenshots');
            const interactiveDir = path.join(tempDirectory, 'interactive');

            await ensureDir(screenshotsDir + '/x');
            if (config.interactive) {
                await ensureDir(interactiveDir + '/x');
            }

            const outputData: Record<string, any> = {};

            for (const artifact of result.artifacts) {
                let savePath = '';

                if (artifact.type === 'desktop') {
                    savePath = path.join(screenshotsDir, `${baseName}_desktop${artifact.extension}`);
                    outputData.desktop = savePath;
                } else if (artifact.type === 'mobile') {
                    savePath = path.join(screenshotsDir, `${baseName}_mobile${artifact.extension}`);
                    outputData.mobile = savePath;
                } else if (artifact.type === 'interactive') {
                    savePath = path.join(interactiveDir, `${baseName}_interactive${artifact.extension}`);
                    outputData.interactive = savePath;
                } else if (artifact.type === 'css') {
                    savePath = path.join(interactiveDir, `${baseName}_styles${artifact.extension}`);
                    outputData.css = savePath;
                } else if (artifact.type === 'element') {
                    const filename = `${baseName}_${artifact.subType}_${artifact.index}_${artifact.state}${artifact.extension}`;
                    savePath = path.join(interactiveDir, filename);
                    if (!outputData.elements) outputData.elements = {};
                    outputData.elements[`${artifact.subType}_${artifact.index}_${artifact.state}`] = savePath;
                }

                if (savePath) {
                    await ArtifactSaver.save(artifact.base64, savePath);
                }
            }

            return {
                packets: [{
                    data: outputData,
                    contentParts: result.contentParts
                }]
            };
        } finally {
            await pageHelper.close();
        }
    }
}
