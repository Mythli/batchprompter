import { z } from 'zod';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import { EventEmitter } from 'eventemitter3';
import {
    Plugin,
    PluginExecutionContext
} from '../types.js';
import { ServiceCapabilities, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema } from '../../config/common.js';
import { InteractiveElementScreenshoter } from '../../utils/puppeteer/InteractiveElementScreenshoter.js';
import { PuppeteerPageHelper } from '../../utils/puppeteer/PuppeteerPageHelper.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';
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
    public readonly events = new EventEmitter();

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return ['hasPuppeteer'];
    }

    async resolveConfig(
        rawConfig: StyleScraperRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' },
        contentResolver: ContentResolver
    ): Promise<StyleScraperResolvedConfigV2> {
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

    async prepareMessages(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        config: StyleScraperResolvedConfigV2,
        context: PluginExecutionContext
    ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
        const { services, outputBasename, emit } = context;
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
                async (ph: PuppeteerPageHelper) => {
                    const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
                    const artifacts: Artifact[] = [];

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

            const baseName = outputBasename || 'style_scrape';
            const outputData: Record<string, any> = {};

            for (const artifact of result.artifacts) {
                let filename = '';
                let subDir = '';

                if (artifact.type === 'desktop' || artifact.type === 'mobile') {
                    subDir = 'screenshots';
                    filename = `${baseName}_${artifact.type}${artifact.extension}`;
                } else if (artifact.type === 'interactive') {
                    subDir = 'interactive';
                    filename = `${baseName}_composite${artifact.extension}`;
                } else if (artifact.type === 'css') {
                    subDir = 'css';
                    filename = `${baseName}_styles${artifact.extension}`;
                } else if (artifact.type === 'element') {
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

                    if (artifact.type === 'desktop') outputData.desktop = filename;
                    if (artifact.type === 'mobile') outputData.mobile = filename;
                    if (artifact.type === 'interactive') outputData.interactive = filename;
                    if (artifact.type === 'css') outputData.css = filename;
                    if (artifact.type === 'element') {
                        if (!outputData.elements) outputData.elements = {};
                        outputData.elements[`${artifact.subType}_${artifact.index}_${artifact.state}`] = filename;
                    }
                }
            }

            const newMessages = [...messages];
            newMessages.push({
                role: 'user',
                content: result.contentParts
            });

            return newMessages;
        } finally {
            await pageHelper.close();
        }
    }
}
