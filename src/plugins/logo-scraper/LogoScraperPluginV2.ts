import { z } from 'zod';
import Handlebars from 'handlebars';
import path from 'path';
import {
    Plugin,
    PluginExecutionContext,
    PluginResult,
    CLIOptionDefinition
} from '../types.js';
import { ServiceCapabilities, ResolvedOutputConfig, ResolvedModelConfig } from '../../config/types.js';
import { OutputConfigSchema, PromptDefSchema } from '../../config/common.js';
import { PromptLoader } from '../../config/PromptLoader.js';
import { ModelFlags } from '../../cli/ModelFlags.js';
import { ensureDir } from '../../utils/fileUtils.js';
import { AiLogoScraper } from './utils/AiLogoScraper.js';
import { ImageDownloader } from './utils/ImageDownloader.js';
import { LogoScraperArtifactHandler } from './LogoScraperArtifactHandler.js';
import { EventEmitter } from 'eventemitter3';

// =============================================================================
// Config Schema
// =============================================================================

export const LogoScraperConfigSchemaV2 = z.object({
    type: z.literal('logo-scraper'),
    id: z.string().optional(),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }),
    url: z.string(),
    
    // Analyze model (Vision capable)
    analyzeModel: z.string().optional(),
    analyzeTemperature: z.number().min(0).max(2).optional(),
    analyzeThinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    analyzePrompt: PromptDefSchema.optional(),
    analyzeSystem: PromptDefSchema.optional(),

    // Extract model (Cheaper/Faster)
    extractModel: z.string().optional(),
    extractTemperature: z.number().min(0).max(2).optional(),
    extractThinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    extractPrompt: PromptDefSchema.optional(),
    extractSystem: PromptDefSchema.optional(),

    maxCandidates: z.number().int().positive().default(10),
    minScore: z.number().int().min(1).max(10).default(5)
});

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
}

// =============================================================================
// Plugin
// =============================================================================

export class LogoScraperPluginV2 implements Plugin<LogoScraperRawConfigV2, LogoScraperResolvedConfigV2> {
    readonly type = 'logo-scraper';
    readonly configSchema = LogoScraperConfigSchemaV2;
    private promptLoader = new PromptLoader();

    readonly cliOptions: CLIOptionDefinition[] = [
        { flags: '--logo-scraper-url <url>', description: 'URL to scrape logos from' },
        ...ModelFlags.getOptions('logo-analyze', { includePrompt: true }),
        ...ModelFlags.getOptions('logo-extract', { includePrompt: true }),
        { flags: '--logo-scraper-max-candidates <number>', description: 'Max logo candidates to download', parser: parseInt },
        { flags: '--logo-scraper-min-score <number>', description: 'Min score (1-10) to keep a logo', parser: parseInt },
        { flags: '--logo-scraper-export', description: 'Merge results into row' },
        { flags: '--logo-scraper-output <column>', description: 'Save to column' }
    ];

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return ['hasPuppeteer'];
    }

    parseCLIOptions(options: Record<string, any>, stepIndex: number): LogoScraperRawConfigV2 | null {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const url = getOpt('logoScraperUrl');
        if (!url) return null;

        const analyzeConfig = ModelFlags.extractPluginModel(options, 'logoAnalyze', stepIndex);
        const extractConfig = ModelFlags.extractPluginModel(options, 'logoExtract', stepIndex);

        const exportFlag = getOpt('logoScraperExport');
        const outputColumn = getOpt('logoScraperOutput');

        let outputMode: 'merge' | 'column' | 'ignore' = 'ignore';
        if (outputColumn) outputMode = 'column';
        else if (exportFlag) outputMode = 'merge';

        const partialConfig = {
            type: 'logo-scraper',
            url,
            analyzeModel: analyzeConfig.model,
            analyzeTemperature: analyzeConfig.temperature,
            analyzeThinkingLevel: analyzeConfig.thinkingLevel,
            analyzePrompt: analyzeConfig.prompt,
            extractModel: extractConfig.model,
            extractTemperature: extractConfig.temperature,
            extractThinkingLevel: extractConfig.thinkingLevel,
            extractPrompt: extractConfig.prompt,
            maxCandidates: getOpt('logoScraperMaxCandidates'),
            minScore: getOpt('logoScraperMinScore'),
            output: {
                mode: outputMode,
                column: outputColumn,
                explode: false
            }
        };

        return this.configSchema.parse(partialConfig);
    }

    async resolveConfig(
        rawConfig: LogoScraperRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
    ): Promise<LogoScraperResolvedConfigV2> {
        const resolveModel = async (
            prompt: any,
            modelOverride?: string,
            temperatureOverride?: number,
            thinkingLevelOverride?: 'low' | 'medium' | 'high'
        ): Promise<ResolvedModelConfig> => {
            let parts: any[] = [];
            if (prompt) {
                parts = await this.promptLoader.load(prompt);
            }
            return {
                model: modelOverride || inheritedModel.model,
                temperature: temperatureOverride ?? inheritedModel.temperature,
                thinkingLevel: thinkingLevelOverride ?? inheritedModel.thinkingLevel,
                systemParts: [],
                promptParts: parts
            };
        };

        const urlTemplate = Handlebars.compile(rawConfig.url, { noEscape: true });
        const url = urlTemplate(row);

        return {
            type: 'logo-scraper',
            id: rawConfig.id ?? `logo-scraper-${Date.now()}`,
            output: {
                mode: rawConfig.output.mode,
                column: rawConfig.output.column,
                explode: rawConfig.output.explode
            },
            url,
            analyzeModel: await resolveModel(
                rawConfig.analyzePrompt,
                rawConfig.analyzeModel,
                rawConfig.analyzeTemperature,
                rawConfig.analyzeThinkingLevel
            ),
            extractModel: await resolveModel(
                rawConfig.extractPrompt,
                rawConfig.extractModel,
                rawConfig.extractTemperature,
                rawConfig.extractThinkingLevel
            ),
            maxCandidates: rawConfig.maxCandidates,
            minScore: rawConfig.minScore
        };
    }

    async execute(
        config: LogoScraperResolvedConfigV2,
        context: PluginExecutionContext
    ): Promise<PluginResult> {
        const { services, tempDirectory } = context;
        const { puppeteerHelper, fetcher } = services;

        if (!puppeteerHelper) {
            throw new Error('[LogoScraper] Puppeteer not available');
        }

        // Setup artifact handler
        const artifactDir = path.join(tempDirectory, 'logo_scraper');
        await ensureDir(artifactDir + '/x');
        
        // Create LLM clients
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

        // Wire up events
        new LogoScraperArtifactHandler(artifactDir, scraper.events);

        const result = await scraper.scrape(config.url);

        if (result.logos && result.logos.length > 0) {
            scraper.events.emit('logo:selected', {
                url: config.url,
                logos: result.logos,
                brandColors: result.brandColors
            });
        }

        return {
            packets: [{
                data: result,
                contentParts: []
            }]
        };
    }
}
