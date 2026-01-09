import { z } from 'zod';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import { EventEmitter } from 'eventemitter3';
import {
    Plugin,
    PluginPacket
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, DEFAULT_PLUGIN_OUTPUT } from '../../config/schemas/index.js';
import { InteractiveElementScreenshoter } from '../../utils/puppeteer/InteractiveElementScreenshoter.js';
import { PuppeteerPageHelper } from '../../utils/puppeteer/PuppeteerPageHelper.js';
import { zHandlebars } from '../../config/validationRules.js';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';
import { StepBaseConfig, GlobalsConfig } from '../../config/schema.js';

// =============================================================================
// Config Schema
// =============================================================================

export const StyleScraperConfigSchemaV2 = z.object({
    type: z.literal('style-scraper').describe("Identifies this as a Style Scraper plugin."),
    id: z.string().optional().describe("Unique ID for this plugin instance."),
    output: OutputConfigSchema.default(DEFAULT_PLUGIN_OUTPUT).describe("How to save the scraped style data."),

    // Required
    url: zHandlebars.describe("URL to scrape. Supports Handlebars."),

    // Options
    resolution: z.string().default('1920x1080').describe("Viewport resolution for desktop screenshot."),
    mobile: z.boolean().default(false).describe("Capture an additional mobile screenshot (iPhone X viewport)."),
    interactive: z.boolean().default(false).describe("Find interactive elements, hover them, and capture screenshots + CSS.")
}).strict().describe("Configuration for the Style Scraper plugin.");

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

export interface StyleScraperHydratedConfigV2 extends Omit<StyleScraperResolvedConfigV2, 'url'> {
    url: string;
}

// =============================================================================
// Plugin
// =============================================================================

export class StyleScraperPluginV2 implements Plugin<StyleScraperRawConfigV2, StyleScraperResolvedConfigV2, StyleScraperHydratedConfigV2> {
    readonly type = 'style-scraper';
    readonly configSchema = StyleScraperConfigSchemaV2;
    public readonly events = new EventEmitter();

    constructor(
        private deps: {
            puppeteerHelper: PuppeteerHelper;
        }
    ) {}

    getSchema(step: StepBaseConfig, globals: GlobalsConfig) {
        return StyleScraperConfigSchemaV2.transform(config => {
            const [w, h] = config.resolution.split('x').map(Number);
            return {
                type: 'style-scraper' as const,
                id: config.id ?? `style-scraper-${Date.now()}`,
                output: config.output,
                url: config.url,
                resolution: { width: w || 1920, height: h || 1080 },
                mobile: config.mobile,
                interactive: config.interactive
            };
        });
    }

    async hydrate(config: StyleScraperResolvedConfigV2, context: Record<string, any>): Promise<StyleScraperHydratedConfigV2> {
        const template = Handlebars.compile(config.url, { noEscape: true });
        const url = template(context);
        return {
            ...config,
            url
        };
    }

    async prepare(stepRow: StepRow, config: StyleScraperHydratedConfigV2): Promise<PluginPacket[]> {
        const { outputBasename } = stepRow;
        const emit = stepRow.step.globalContext.events.emit.bind(stepRow.step.globalContext.events);
        const puppeteerHelper = this.deps.puppeteerHelper;

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
                        row: stepRow.item.originalIndex,
                        step: stepRow.step.stepIndex,
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

            return [{
                data: [outputData],
                contentParts: result.contentParts
            }];

        } finally {
            await pageHelper.close();
        }
    }

    async postProcess(stepRow: StepRow, config: StyleScraperHydratedConfigV2, modelResult: any): Promise<PluginPacket[]> {
        return [{
            data: [modelResult],
            contentParts: []
        }];
    }
}
