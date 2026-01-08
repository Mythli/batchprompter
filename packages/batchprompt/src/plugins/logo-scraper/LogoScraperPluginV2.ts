import { z } from 'zod';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import {
    Plugin,
    PluginExecutionContext,
    PluginPacket,
    LlmFactory
} from '../types.js';
import { ServiceCapabilities, ResolvedOutputConfig, ResolvedModelConfig } from '../../config/types.js';
import { OutputConfigSchema, PluginModelConfigSchema, DEFAULT_PLUGIN_OUTPUT } from '../../config/schemas/index.js';
import { PromptLoader } from '../../config/PromptLoader.js';
import { aggressiveSanitize } from '../../utils/fileUtils.js';
import { AiLogoScraper, LogoScraperResult, AnalyzedLogo } from './utils/AiLogoScraper.js';
import { ImageDownloader } from './utils/ImageDownloader.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';
import { zHandlebars } from '../../config/validationRules.js';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';
import { Fetcher } from 'llm-fns';

// =============================================================================
// Config Schema
// =============================================================================

export const LogoScraperConfigSchemaV2 = z.object({
    type: z.literal('logo-scraper').describe("Identifies this as a Logo Scraper plugin."),
    id: z.string().optional().describe("Unique ID for this plugin instance."),
    output: OutputConfigSchema.default(DEFAULT_PLUGIN_OUTPUT).describe("How to save the scraped logos."),
    
    // Required
    url: zHandlebars.describe("URL to scrape logos from. Supports Handlebars."),

    // Nested model configs
    analyze: PluginModelConfigSchema.optional().describe("Model configuration for analyzing screenshots and scoring logos (vision capable)."),
    extract: PluginModelConfigSchema.optional().describe("Model configuration for finding inline SVGs and image URLs."),

    // Options
    maxCandidates: z.number().int().positive().default(10).describe("Max logo candidates to download and analyze."),
    minScore: z.number().int().min(1).max(10).default(5).describe("Min score (1-10) to keep a logo."),

    logoPath: zHandlebars.optional().describe("Path to save the best logo (supports templates)."),
    faviconPath: zHandlebars.optional().describe("Path to save the best favicon (supports templates)."),

    logoLimit: z.number().int().positive().default(1).describe("Max logos to save."),
    faviconLimit: z.number().int().positive().default(1).describe("Max favicons to save.")
}).strict().describe("Configuration for the Logo Scraper plugin.");

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

    constructor(
        private deps: {
            promptLoader: PromptLoader;
            puppeteerHelper?: PuppeteerHelper;
            fetcher?: Fetcher;
            createLlm: LlmFactory;
        }
    ) {}

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
            promptParts = await this.deps.promptLoader.load(config.prompt);
            promptParts = promptParts.map((part: any) => {
                if (part.type === 'text') {
                    const template = Handlebars.compile(part.text, { noEscape: true });
                    return { type: 'text' as const, text: template(row) };
                }
                return part;
            });
        }

        if (config?.system) {
            systemParts = await this.deps.promptLoader.load(config.system);
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
        const { emit } = context;
        const puppeteerHelper = this.deps.puppeteerHelper;
        const fetcher = this.deps.fetcher;

        if (!puppeteerHelper) {
            throw new Error('[LogoScraper] Puppeteer not available');
        }

        if (!fetcher) {
            throw new Error('[LogoScraper] Fetcher not available');
        }

        // Create LLM clients
        const analyzeLlm = this.deps.createLlm(config.analyzeModel);
        const extractLlm = this.deps.createLlm(config.extractModel);

        // Create dependencies
        const imageDownloader = new ImageDownloader(fetcher);

        // Create scraper
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

        console.log(`[LogoScraper] Scraping logos from: ${config.url}`);

        const result: LogoScraperResult = await scraper.scrape(config.url);

        // Emit artifacts for logos
        const logos = result.logos || [];
        const outputData: Record<string, any> = {
            primaryColor: result.primaryColor,
            brandColors: result.brandColors,
            logos: []
        };

        // Save logos
        for (let i = 0; i < Math.min(logos.length, config.logoLimit); i++) {
            const logo = logos[i];
            if (!logo.isFavicon) {
                const filename = config.logoPath 
                    ? (i === 0 ? config.logoPath : config.logoPath.replace(/\.(\w+)$/, `_${i}.$1`))
                    : `logo_scraper/logos/logo_${i}.png`;

                // Convert base64 data URI to buffer
                const base64Data = logo.base64PngData.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');

                emit('plugin:artifact', {
                    row: context.row.index,
                    step: context.stepIndex,
                    plugin: 'logo-scraper',
                    type: 'image',
                    filename,
                    content: buffer,
                    tags: ['final', 'logo-scraper', 'logo']
                });

                outputData.logos.push({
                    path: filename,
                    score: logo.brandLogoScore,
                    width: logo.width,
                    height: logo.height
                });
            }
        }

        // Save favicons
        const favicons = logos.filter((l: AnalyzedLogo) => l.isFavicon);
        for (let i = 0; i < Math.min(favicons.length, config.faviconLimit); i++) {
            const favicon = favicons[i];
            const filename = config.faviconPath
                ? (i === 0 ? config.faviconPath : config.faviconPath.replace(/\.(\w+)$/, `_${i}.$1`))
                : `logo_scraper/favicons/favicon_${i}.png`;

            const base64Data = favicon.base64PngData.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');

            emit('plugin:artifact', {
                row: context.row.index,
                step: context.stepIndex,
                plugin: 'logo-scraper',
                type: 'image',
                filename,
                content: buffer,
                tags: ['final', 'logo-scraper', 'favicon']
            });

            if (!outputData.favicon) {
                outputData.favicon = {
                    path: filename,
                    score: favicon.brandLogoScore,
                    width: favicon.width,
                    height: favicon.height
                };
            }
        }

        // Build content parts for LLM context
        const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

        if (logos.length > 0) {
            contentParts.push({
                type: 'text',
                text: `\n--- Logo Analysis for ${config.url} ---\nFound ${logos.length} logos. Primary brand color: ${result.primaryColor?.hex || 'unknown'}\n`
            });

            // Include best logo as image
            const bestLogo = logos[0];
            if (bestLogo) {
                contentParts.push({
                    type: 'image_url',
                    image_url: { url: bestLogo.base64PngData }
                });
            }
        } else {
            contentParts.push({
                type: 'text',
                text: `\n--- Logo Analysis for ${config.url} ---\nNo suitable logos found.\n`
            });
        }

        return [{
            data: outputData,
            contentParts
        }];
    }
}
