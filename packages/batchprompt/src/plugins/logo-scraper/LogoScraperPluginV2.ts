import { z } from 'zod';
import OpenAI from 'openai';
import Handlebars from 'handlebars';
import {
    BasePlugin,
    LlmFactory,
    PluginPacket
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { OutputConfigSchema, RawModelConfigSchema, DEFAULT_PLUGIN_OUTPUT, resolveModelConfig } from '../../config/schemas/index.js';
import { aggressiveSanitize } from '../../utils/fileUtils.js';
import { AiLogoScraper, LogoScraperResult, AnalyzedLogo } from './utils/AiLogoScraper.js';
import { ImageDownloader } from './utils/ImageDownloader.js';
import { zHandlebars } from '../../config/validationRules.js';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';
import { Fetcher } from 'llm-fns';
import { StepBaseConfig, GlobalsConfig } from '../../config/schema.js';

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

export type LogoScraperConfig = z.output<typeof LogoScraperConfigSchemaV2>;

export class LogoScraperPluginV2 extends BasePlugin<LogoScraperConfig> {
    readonly type = 'logo-scraper';

    constructor(
        private deps: {
            puppeteerHelper: PuppeteerHelper;
            fetcher: Fetcher;
            createLlm: LlmFactory;
        }
    ) {
        super();
    }

    getSchema(step: StepBaseConfig, globals: GlobalsConfig) {
        return LogoScraperConfigSchemaV2.transform(config => {
            return {
                ...config,
                id: config.id ?? `logo-scraper-${Date.now()}`,
                analyzeModel: resolveModelConfig(config.analyze, step.model),
                extractModel: resolveModelConfig(config.extract, step.model),
            };
        });
    }

    async hydrate(config: LogoScraperConfig, context: Record<string, any>): Promise<LogoScraperConfig> {
        const sanitizedRow: Record<string, any> = {};
        for (const [key, val] of Object.entries(context)) {
             const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
             sanitizedRow[key] = aggressiveSanitize(stringVal);
        }

        const urlTemplate = Handlebars.compile(config.url, { noEscape: true });
        const url = urlTemplate(context);

        let logoPath: string | undefined;
        if (config.logoPath) {
            const t = Handlebars.compile(config.logoPath, { noEscape: true });
            logoPath = t(sanitizedRow);
        }

        let faviconPath: string | undefined;
        if (config.faviconPath) {
            const t = Handlebars.compile(config.faviconPath, { noEscape: true });
            faviconPath = t(sanitizedRow);
        }

        return {
            ...config,
            url,
            logoPath,
            faviconPath
        };
    }

    async prepare(stepRow: StepRow, config: LogoScraperConfig): Promise<PluginPacket[]> {
        const emit = stepRow.step.deps.events.emit.bind(stepRow.step.deps.events);
        const puppeteerHelper = this.deps.puppeteerHelper;
        const fetcher = this.deps.fetcher;

        const analyzeLlm = await stepRow.createLlm(config.analyzeModel);
        const extractLlm = await stepRow.createLlm(config.extractModel);

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

        const result: LogoScraperResult = await scraper.scrape(config.url);

        const logos = result.logos || [];
        const outputData: Record<string, any> = {
            primaryColor: result.primaryColor,
            brandColors: result.brandColors,
            logos: []
        };

        for (let i = 0; i < Math.min(logos.length, config.logoLimit); i++) {
            const logo = logos[i];
            if (!logo.isFavicon) {
                const filename = config.logoPath
                    ? (i === 0 ? config.logoPath : config.logoPath.replace(/\.(\w+)$/, `_${i}.$1`))
                    : `logo_scraper/logos/logo_${i}.png`;

                const base64Data = logo.base64PngData.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');

                emit('plugin:artifact', {
                    row: stepRow.getOriginalIndex(),
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
            const filename = config.faviconPath
                ? (i === 0 ? config.faviconPath : config.faviconPath.replace(/\.(\w+)$/, `_${i}.$1`))
                : `logo_scraper/favicons/favicon_${i}.png`;

            const base64Data = favicon.base64PngData.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');

            emit('plugin:artifact', {
                row: stepRow.getOriginalIndex(),
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

        const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

        if (logos.length > 0) {
            contentParts.push({
                type: 'text',
                text: `\n--- Logo Analysis for ${config.url} ---\nFound ${logos.length} logos. Primary brand color: ${result.primaryColor?.hex || 'unknown'}\n`
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
                text: `\n--- Logo Analysis for ${config.url} ---\nNo suitable logos found.\n`
            });
        }

        return [{
            data: [outputData],
            contentParts
        }];
    }
}
