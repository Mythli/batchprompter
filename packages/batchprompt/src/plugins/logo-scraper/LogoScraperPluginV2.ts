import { z } from 'zod';
import {
    Plugin,
    LlmFactory
} from '../types.js';
import { Step } from '../../core/Step.js';
import { StepRow } from '../../core/StepRow.js';
import { ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, RawModelConfigSchema, DEFAULT_PLUGIN_OUTPUT } from '../../config/schemas/index.js';
import { aggressiveSanitize } from '../../utils/fileUtils.js';
import { AiLogoScraper, LogoScraperResult, AnalyzedLogo } from './utils/AiLogoScraper.js';
import { ImageDownloader } from './utils/ImageDownloader.js';
import { zHandlebars } from '../../config/validationRules.js';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';
import { Fetcher } from 'llm-fns';

export const LogoScraperConfigSchemaV2 = z.object({
    type: z.literal('logo-scraper'),
    id: z.string().optional(),
    output: OutputConfigSchema.default(DEFAULT_PLUGIN_OUTPUT),
    url: zHandlebars,
    analyze: RawModelConfigSchema.optional(),
    extract: RawModelConfigSchema.optional(),
    maxCandidates: z.number().int().positive().default(10),
    minScore: z.number().int().min(1).max(10).default(5),
    logoPath: zHandlebars.optional(),
    faviconPath: zHandlebars.optional(),
    logoLimit: z.number().int().positive().default(1),
    faviconLimit: z.number().int().positive().default(1)
}).strict();

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

    async init(step: Step, rawConfig: any): Promise<LogoScraperResolvedConfigV2> {
        return {
            type: 'logo-scraper',
            id: rawConfig.id ?? `logo-scraper-${Date.now()}`,
            output: rawConfig.output,
            url: rawConfig.url,
            analyzeModel: rawConfig.analyze,
            extractModel: rawConfig.extract,
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

        const analyzeLlm = stepRow.createLlm(config.analyzeModel);
        const extractLlm = stepRow.createLlm(config.extractModel);

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

        const result: LogoScraperResult = await scraper.scrape(url);

        const logos = result.logos || [];
        const outputData: Record<string, any> = {
            primaryColor: result.primaryColor,
            brandColors: result.brandColors,
            logos: []
        };

        for (let i = 0; i < Math.min(logos.length, config.logoLimit); i++) {
            const logo = logos[i];
            if (!logo.isFavicon) {
                const filename = logoPath 
                    ? (i === 0 ? logoPath : logoPath.replace(/\.(\w+)$/, `_${i}.$1`))
                    : `logo_scraper/logos/logo_${i}.png`;

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

        const contentParts = [];

        if (logos.length > 0) {
            contentParts.push({
                type: 'text',
                text: `\n--- Logo Analysis for ${url} ---\nFound ${logos.length} logos. Primary brand color: ${result.primaryColor?.hex || 'unknown'}\n`
            });

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
