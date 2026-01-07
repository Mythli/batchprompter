import { z } from 'zod';
import Handlebars from 'handlebars';
import path from 'path';
import OpenAI from 'openai';
import {
    Plugin,
    PluginExecutionContext,
    PluginPacket
} from '../types.js';
import { ServiceCapabilities, ResolvedOutputConfig, ResolvedModelConfig } from '../../config/types.js';
import { OutputConfigSchema, PluginModelConfigSchema } from '../../config/common.js';
import { PromptLoader } from '../../config/PromptLoader.js';
import { aggressiveSanitize } from '../../utils/fileUtils.js';
import { AiLogoScraper } from './utils/AiLogoScraper.js';
import { ImageDownloader } from './utils/ImageDownloader.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';
import { zHandlebars } from '../../config/validationRules.js';

// =============================================================================
// Config Schema
// =============================================================================

export const LogoScraperConfigSchemaV2 = z.object({
    type: z.literal('logo-scraper').describe("Identifies this as a Logo Scraper plugin."),
    id: z.string().optional().describe("Unique ID for this plugin instance."),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }).describe("How to save the scraped logos."),
    url: zHandlebars.describe("URL to scrape logos from. Supports Handlebars."),

    // Nested model configs
    analyze: PluginModelConfigSchema.optional().describe("Model configuration for analyzing screenshots and scoring logos (vision capable)."),
    extract: PluginModelConfigSchema.optional().describe("Model configuration for finding inline SVGs and image URLs."),

    maxCandidates: z.number().int().positive().default(10).describe("Max logo candidates to download and analyze."),
    minScore: z.number().int().min(1).max(10).default(5).describe("Min score (1-10) to keep a logo."),

    logoPath: zHandlebars.optional().describe("Path to save the best logo (supports templates)."),
    faviconPath: zHandlebars.optional().describe("Path to save the best favicon (supports templates)."),

    logoLimit: z.number().int().positive().default(1).describe("Max logos to save."),
    faviconLimit: z.number().int().positive().default(1).describe("Max favicons to save.")
}).describe("Configuration for the Logo Scraper plugin.");

export type LogoScraperRawConfigV2 = z.infer<typeof LogoScraperConfigSchemaV2>;

export interface LogoScraperResolvedConfigV2 {
    type: 'logo-scraper';
    id: string;
    output: ResolvedOutputConfig;
    url: string;
    analyzeModel: ResolvedModelConfig;
    extractModel: ResolvedModelConfig;
    maxCandidates: number;
    minScore: number;
    logoPath?: string;
    faviconPath?: string;
    logoLimit: number;
    faviconLimit: number;
}

// =============================================================================
// Plugin
// =============================================================================

export class LogoScraperPluginV2 implements Plugin<LogoScraperRawConfigV2, LogoScraperResolvedConfigV2> {
    readonly type = 'logo-scraper';
    readonly configSchema = LogoScraperConfigSchemaV2;

    constructor(private promptLoader: PromptLoader) {}

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return ['hasPuppeteer'];
    }

    private async resolvePluginModel(
        config: z.infer<typeof PluginModelConfigSchema> | undefined,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
    ): Promise<ResolvedModelConfig> {
        let promptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        let systemParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

        if (config?.prompt) {
            promptParts = await this.promptLoader.load(config.prompt);
            promptParts = promptParts.map((part: any) => {
                if (part.type === 'text') {
                    const template = Handlebars.compile(part.text, { noEscape: true });
                    return { type: 'text' as const, text: template(row) };
                }
                return part;
            });
        }

        if (config?.system) {
            systemParts = await this.promptLoader.load(config.system);
            systemParts = systemParts.map((part: any) => {
                if (part.type === 'text') {
                    const template = Handlebars.compile(part.text, { noEscape: true });
                    return { type: 'text' as const, text: template(row) };
                }
                return part;
            });
        }

        return {
            model: config?.model || inheritedModel.model,
            temperature: config?.temperature ?? inheritedModel.temperature,
            thinkingLevel: config?.thinkingLevel ?? inheritedModel.thinkingLevel,
            systemParts,
            promptParts
        };
    }

    async resolveConfig(
        rawConfig: LogoScraperRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' },
        contentResolver: ContentResolver
    ): Promise<LogoScraperResolvedConfigV2> {
        
        const urlTemplate = Handlebars.compile(rawConfig.url, { noEscape: true });
        const url = urlTemplate(row);

        const sanitizedRow: Record<string, any> = {};
        for (const [key, val] of Object.entries(row)) {
             const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
             sanitizedRow[key] = aggressiveSanitize(stringVal);
        }

        let logoPath: string | undefined;
        if (rawConfig.logoPath) {
            const template = Handlebars.compile(rawConfig.logoPath, { noEscape: true });
            logoPath = template(sanitizedRow);
        }

        let faviconPath: string | undefined;
        if (rawConfig.faviconPath) {
            const template = Handlebars.compile(rawConfig.faviconPath, { noEscape: true });
            faviconPath = template(sanitizedRow);
        }

        return {
            type: 'logo-scraper',
            id: rawConfig.id ?? `logo-scraper-${Date.now()}`,
            output: {
                mode: rawConfig.output.mode,
                column: rawConfig.output.column,
                explode: rawConfig.output.explode
            },
            url,
            analyzeModel: await this.resolvePluginModel(rawConfig.analyze, row, inheritedModel),
            extractModel: await this.resolvePluginModel(rawConfig.extract, row, inheritedModel),
            maxCandidates: rawConfig.maxCandidates,
            minScore: rawConfig.minScore,
            logoPath,
            faviconPath,
            logoLimit: rawConfig.logoLimit,
            faviconLimit: rawConfig.faviconLimit
        };
    }

    async prepareMessages(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        config: LogoScraperResolvedConfigV2,
        context: PluginExecutionContext
    ): Promise<PluginPacket[]> {
        const { services, emit } = context;
        const { puppeteerHelper, fetcher } = services;

        if (!puppeteerHelper) {
            throw new Error('[LogoScraper] Puppeteer not available');
        }

        const analyzeLlm = services.createLlm(config.analyzeModel);
        const extractLlm = services.createLlm(config.extractModel);

        const imageDownloader = new ImageDownloader(fetcher);
        const scraper = new AiLogoScraper(
            puppeteerHelper,
            analyzeLlm,
            extractLlm,
            imageDownloader,
            {
                maxLogosToAnalyze: config.maxCandidates,
                brandLogoScoreThreshold: config.minScore
            }
        );

        const result = await scraper.scrape(config.url) as any;

        const packetData: any = {
            brandColor: result.primaryColor?.hex,
            brandColors: result.brandColors?.map((c: any) => c.hex) || [],
            logos: [],
            favicons: [],
            logoMetadata: []
        };

        if (result.logos && result.logos.length > 0) {
            const safeUrl = config.url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);

            emit('plugin:artifact', {
                row: context.row.index,
                step: context.stepIndex,
                plugin: 'logo-scraper',
                type: 'json',
                filename: `logo_scraper/analysis/${safeUrl}_analysis.json`,
                content: JSON.stringify({ brandColors: result.brandColors, logos: result.logos }, null, 2),
                tags: ['debug', 'logo-scraper', 'analysis']
            });

            let savedLogosCount = 0;
            let savedFaviconsCount = 0;
            const savedLogoPaths: string[] = [];
            const savedFaviconPaths: string[] = [];

            for (let i = 0; i < result.logos.length; i++) {
                const logo = result.logos[i];

                const tempFilename = `logo_scraper/logos/${safeUrl}/logo_${i}.png`;
                emit('plugin:artifact', {
                    row: context.row.index,
                    step: context.stepIndex,
                    plugin: 'logo-scraper',
                    type: 'image',
                    filename: tempFilename,
                    content: logo.base64PngData,
                    tags: ['debug', 'logo-scraper', 'logo']
                });

                const isSquare = Math.abs((logo.width || 0) - (logo.height || 0)) <= 1;

                const isFaviconTarget = isSquare && !!config.faviconPath;

                const limit = isFaviconTarget ? config.faviconLimit : config.logoLimit;
                const currentCount = isFaviconTarget ? savedFaviconsCount : savedLogosCount;
                const pathTemplate = isFaviconTarget ? config.faviconPath : config.logoPath;

                if (pathTemplate && currentCount < limit) {
                    let finalPath = pathTemplate;

                    if (limit > 1) {
                        const ext = path.extname(pathTemplate);
                        const base = pathTemplate.slice(0, -ext.length);
                        finalPath = `${base}_${currentCount + 1}${ext}`;
                    }

                    emit('plugin:artifact', {
                        row: context.row.index,
                        step: context.stepIndex,
                        plugin: 'logo-scraper',
                        type: 'image',
                        filename: finalPath,
                        content: logo.base64PngData,
                        tags: ['final', 'logo-scraper', isFaviconTarget ? 'favicon' : 'logo']
                    });

                    if (isFaviconTarget) {
                        savedFaviconsCount++;
                        savedFaviconPaths.push(finalPath);
                    } else {
                        savedLogosCount++;
                        savedLogoPaths.push(finalPath);
                    }

                    packetData.logoMetadata.push({
                        path: finalPath,
                        score: logo.brandLogoScore,
                        performance: logo.lightBackgroundPerformance,
                        isFavicon: isFaviconTarget,
                        width: logo.width,
                        height: logo.height
                    });
                }
            }

            packetData.logo = savedLogoPaths.length > 0 ? savedLogoPaths[0] : undefined;
            packetData.favicon = savedFaviconPaths.length > 0 ? savedFaviconPaths[0] : undefined;
            packetData.logos = savedLogoPaths;
            packetData.favicons = savedFaviconPaths;
        }

        // Add summary to messages
        const summary = `Logo Scraper Results for ${config.url}:
- Primary Brand Color: ${packetData.brandColor || 'None'}
- Logos Found: ${packetData.logos.length}
- Favicons Found: ${packetData.favicons.length}
`;
        
        return [{
            data: packetData,
            contentParts: [{ type: 'text', text: summary }]
        }];
    }
}
