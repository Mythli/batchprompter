import { z } from 'zod';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import {
    Plugin,
    LlmFactory
} from '../types.js';
import { Step } from '../../core/Step.js';
import { StepRow } from '../../core/StepRow.js';
import { ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, BaseModelConfigSchema, DEFAULT_PLUGIN_OUTPUT } from '../../config/schemas/index.js';
import { aggressiveSanitize } from '../../utils/fileUtils.js';
import { AiLogoScraper, LogoScraperResult, AnalyzedLogo } from './utils/AiLogoScraper.js';
import { ImageDownloader } from './utils/ImageDownloader.js';
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
    analyze: BaseModelConfigSchema.optional().describe("Model configuration for analyzing screenshots and scoring logos (vision capable)."),
    extract: BaseModelConfigSchema.optional().describe("Model configuration for finding inline SVGs and image URLs."),

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
            puppeteerHelper: PuppeteerHelper;
            fetcher: Fetcher;
            createLlm: LlmFactory;
        }
    ) {}

    private async resolvePluginModel(
        step: Step,
        config: z.infer<typeof BaseModelConfigSchema> | undefined
    ): Promise<ResolvedModelConfig> {
        const promptParts = config?.prompt ? await step.loadPrompt(config.prompt) : [];
        const systemParts = config?.system ? await step.loadPrompt(config.system) : [];

        return {
            model: config?.model,
            temperature: config?.temperature,
            thinkingLevel: config?.thinkingLevel,
            systemParts,
            promptParts
        };
    }

    async init(step: Step, rawConfig: LogoScraperRawConfigV2): Promise<LogoScraperResolvedConfigV2> {
        return {
            type: 'logo-scraper',
            id: rawConfig.id ?? `logo-scraper-${Date.now()}`,
            output: {
                mode: rawConfig.output.mode,
                column: rawConfig.output.column,
                explode: rawConfig.output.explode
            },
            url: rawConfig.url,
            analyzeModel: await this.resolvePluginModel(step, rawConfig.analyze),
            extractModel: await this.resolvePluginModel(step, rawConfig.extract),
            maxCandidates: rawConfig.maxCandidates,
            minScore: rawConfig.minScore,
            logoPath: rawConfig.logoPath,
            faviconPath: rawConfig.faviconPath,
            logoLimit: rawConfig.logoLimit,
            faviconLimit: rawConfig.faviconLimit
        };
    }

    async prepare(stepRow: StepRow, config: LogoScraperResolvedConfigV2): Promise<void> {
        const { context } = stepRow;
        const emit = stepRow.step.globalContext.events.emit.bind(stepRow.step.globalContext.events);
        const puppeteerHelper = this.deps.puppeteerHelper;
        const fetcher = this.deps.fetcher;

        const url = stepRow.render(config.url);

        const sanitizedRow: Record<string, any> = {};
        for (const [key, val] of Object.entries(context)) {
             const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
             sanitizedRow[key] = aggressiveSanitize(stringVal);
        }

        let logoPath: string | undefined;
        if (config.logoPath) {
            logoPath = stepRow.render(config.logoPath, sanitizedRow);
        }

        let faviconPath: string | undefined;
        if (config.faviconPath) {
            faviconPath = stepRow.render(config.faviconPath, sanitizedRow);
        }

        // Create LLM clients
        const analyzeLlm = stepRow.createLlm(config.analyzeModel);
        const extractLlm = stepRow.createLlm(config.extractModel);

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

        console.log(`[LogoScraper] Scraping logos from: ${url}`);

        const result: LogoScraperResult = await scraper.scrape(url);

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
                const filename = logoPath 
                    ? (i === 0 ? logoPath : logoPath.replace(/\.(\w+)$/, `_${i}.$1`))
                    : `logo_scraper/logos/logo_${i}.png`;

                // Convert base64 data URI to buffer
                const base64Data = logo.base64PngData.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');

                emit('plugin:artifact', {
                    row: stepRow.item.originalIndex,
                    step: stepRow.step.stepIndex,
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
            const filename = faviconPath
                ? (i === 0 ? faviconPath : faviconPath.replace(/\.(\w+)$/, `_${i}.$1`))
                : `logo_scraper/favicons/favicon_${i}.png`;

            const base64Data = favicon.base64PngData.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');

            emit('plugin:artifact', {
                row: stepRow.item.originalIndex,
                step: stepRow.step.stepIndex,
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
                text: `\n--- Logo Analysis for ${url} ---\nFound ${logos.length} logos. Primary brand color: ${result.primaryColor?.hex || 'unknown'}\n`
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
                text: `\n--- Logo Analysis for ${url} ---\nNo suitable logos found.\n`
            });
        }

        stepRow.appendContent(contentParts);
        stepRow.context._logoScraper_result = outputData;
    }

    async postProcess(stepRow: StepRow, config: LogoScraperResolvedConfigV2, modelResult: any): Promise<any> {
        const result = stepRow.context._logoScraper_result;
        if (result && (modelResult === null || modelResult === undefined)) {
            return result;
        }
        return modelResult;
    }
}
