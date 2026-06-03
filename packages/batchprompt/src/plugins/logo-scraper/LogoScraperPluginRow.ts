import { BasePluginRow, PluginResult, PluginItem } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { LogoScraperConfig } from './LogoScraperPlugin.js';
import { BrandAssetScraper } from 'ai-brand-scraper';
import type { AiBrandLlm, ImageDownloader, PageActionExecutor } from 'ai-brand-scraper';
import type { BoundLlmClient } from '../../BoundLlmClient.js';
import type { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';
import * as path from 'path';

function toAiBrandLlm(llm: BoundLlmClient): AiBrandLlm {
    return {
        promptZod(messages, schema) {
            return llm.getRawClient().promptZod([...llm.getMessages(), ...messages], schema);
        },
        promptText(options) {
            return llm.getRawClient().promptText({
                messages: [...llm.getMessages(), ...options.messages],
            });
        },
    };
}

export class LogoScraperPluginRow extends BasePluginRow<LogoScraperConfig> {
    constructor(
        stepRow: StepRow,
        config: LogoScraperConfig,
        private puppeteerHelper: PuppeteerHelper,
        private imageDownloader: ImageDownloader
    ) {
        super(stepRow, config);
    }

    async prepare(): Promise<PluginResult> {
        const { stepRow, config } = this;
        const emit = stepRow.step.deps.events.emit.bind(stepRow.step.deps.events);
        const tmpDir = await stepRow.getTempDir();

        // Fallback to step's default model if plugin-specific models aren't provided
        const analyzeLlm = config.analyzeModel ? await stepRow.createLlm(config.analyzeModel) : await stepRow.createLlm();
        const extractLlm = config.extractModel ? await stepRow.createLlm(config.extractModel) : await stepRow.createLlm();
        const pageExecutor = this.createPageExecutor();

        const brandAssetScraper = new BrandAssetScraper({
            pageExecutor,
            analyzeLlm: toAiBrandLlm(analyzeLlm),
            extractLlm: toAiBrandLlm(extractLlm),
            imageDownloader: this.imageDownloader
        });

        brandAssetScraper.events.on('logo:found', (data) => {
            emit('artifact:emit', {
                row: stepRow.getOriginalIndex(),
                step: stepRow.step.stepIndex,
                source: 'logoScraper',
                type: 'json',
                filename: path.join(tmpDir, `logoScraper/found/found_${Date.now()}.json`),
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'logoScraper', 'found']
            });
        });

        brandAssetScraper.events.on('logo:downloaded', (data) => {
            const buffer = Buffer.from(data.base64PngData.split(',')[1], 'base64');
            emit('artifact:emit', {
                row: stepRow.getOriginalIndex(),
                step: stepRow.step.stepIndex,
                source: 'logoScraper',
                type: 'image',
                filename: path.join(tmpDir, `logoScraper/downloaded/logo_${data.index}_${Date.now()}.png`),
                content: buffer,
                tags: ['debug', 'logoScraper', 'downloaded']
            });
        });

        brandAssetScraper.events.on('analysis:complete', (data) => {
            emit('artifact:emit', {
                row: stepRow.getOriginalIndex(),
                step: stepRow.step.stepIndex,
                source: 'logoScraper',
                type: 'json',
                filename: path.join(tmpDir, `logoScraper/analysis/analysis_${Date.now()}.json`),
                content: JSON.stringify(data, null, 2),
                tags: ['final', 'logoScraper', 'analysis']
            });
        });

        const result = await brandAssetScraper.scrape({
            url: config.url,
            maxLogosToAnalyze: config.maxLogosToAnalyze,
            brandLogoScoreThreshold: config.brandLogoScoreThreshold
        });
        const history = await stepRow.getPreparedMessages();

        // If no logos found, return empty
        if (!result.logos || result.logos.length === 0) {
            return {
                history,
                items: [{
                    data: { brandColors: result.brandColors, primaryColor: result.primaryColor, logos: [] },
                    contentParts: [{ type: 'text', text: 'No logos found.' }]
                }]
            };
        }

        // Extract specific requested files
        const bestLogo = result.logos[0];
        const bestFavicon = result.logos.find(l => l.isFavicon || l.width === l.height);

        if (config.logoOutputPath && bestLogo) {
            const buffer = Buffer.from(bestLogo.base64PngData.split(',')[1], 'base64');
            emit('artifact:emit', {
                row: stepRow.getOriginalIndex(),
                step: stepRow.step.stepIndex,
                source: 'logoScraper',
                type: 'image',
                filename: config.logoOutputPath,
                content: buffer,
                tags: ['final', 'logoScraper', 'logo']
            });
        }

        if (config.faviconOutputPath && bestFavicon) {
            const buffer = Buffer.from(bestFavicon.base64PngData.split(',')[1], 'base64');
            emit('artifact:emit', {
                row: stepRow.getOriginalIndex(),
                step: stepRow.step.stepIndex,
                source: 'logoScraper',
                type: 'image',
                filename: config.faviconOutputPath,
                content: buffer,
                tags: ['final', 'logoScraper', 'favicon']
            });
        }

        // Build items
        const items: PluginItem[] = result.logos.map((logo) => {
            const contentText = `Logo Score: ${logo.brandLogoScore}\nDimensions: ${logo.width}x${logo.height}\nOriginal URL: ${logo.originalUrl}`;
            return {
                data: {
                    logo,
                    brandColors: result.brandColors,
                    primaryColor: result.primaryColor
                },
                contentParts: [
                    { type: 'text' as const, text: `\n--- Logo Scraper Result ---\n${contentText}\n--------------------------\n` },
                    { type: 'image_url' as const, image_url: { url: logo.base64PngData } }
                ]
            };
        });

        return {
            history,
            items
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
