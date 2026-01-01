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
import { ensureDir, aggressiveSanitize } from '../../utils/fileUtils.js';
import { AiLogoScraper } from './utils/AiLogoScraper.js';
import { ImageDownloader } from './utils/ImageDownloader.js';
import { LogoScraperArtifactHandler } from './LogoScraperArtifactHandler.js';
import { EventEmitter } from 'eventemitter3';
import { ArtifactSaver } from '../../ArtifactSaver.js';

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
    minScore: z.number().int().min(1).max(10).default(5),
    
    // Output path for the best logo
    logoOutputPath: z.string().optional(),
    // Output path for the best favicon
    faviconOutputPath: z.string().optional(),

    // Limits
    maxLogosToSave: z.number().int().positive().default(1),
    maxFaviconsToSave: z.number().int().positive().default(1)
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
    logoOutputPath?: string;
    faviconOutputPath?: string;
    maxLogosToSave: number;
    maxFaviconsToSave: number;
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
        { flags: '--logo-scraper-logo-output-path <path>', description: 'Path to save the best logo (supports templates)' },
        { flags: '--logo-scraper-favicon-output-path <path>', description: 'Path to save the best favicon (supports templates)' },
        { flags: '--logo-scraper-max-save <number>', description: 'Max logos to save (default: 1)', parser: parseInt },
        { flags: '--logo-scraper-max-favicon-save <number>', description: 'Max favicons to save (default: 1)', parser: parseInt },
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
            logoOutputPath: getOpt('logoScraperLogoOutputPath'),
            faviconOutputPath: getOpt('logoScraperFaviconOutputPath'),
            maxLogosToSave: getOpt('logoScraperMaxSave'),
            maxFaviconsToSave: getOpt('logoScraperMaxFaviconSave'),
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

        // Sanitize row data for file path usage
        const sanitizedRow: Record<string, any> = {};
        for (const [key, val] of Object.entries(row)) {
             const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
             sanitizedRow[key] = aggressiveSanitize(stringVal);
        }

        let logoOutputPath: string | undefined;
        if (rawConfig.logoOutputPath) {
            const template = Handlebars.compile(rawConfig.logoOutputPath, { noEscape: true });
            logoOutputPath = template(sanitizedRow);
        }

        let faviconOutputPath: string | undefined;
        if (rawConfig.faviconOutputPath) {
            const template = Handlebars.compile(rawConfig.faviconOutputPath, { noEscape: true });
            faviconOutputPath = template(sanitizedRow);
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
            minScore: rawConfig.minScore,
            logoOutputPath,
            faviconOutputPath,
            maxLogosToSave: rawConfig.maxLogosToSave,
            maxFaviconsToSave: rawConfig.maxFaviconsToSave
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

        // Prepare data packet
        const packetData: any = {
            brandColor: result.primaryColor?.hex,
            brandColors: result.brandColors?.map(c => c.hex) || [],
            logos: [],
            favicons: [],
            logoMetadata: []
        };

        if (result.logos && result.logos.length > 0) {
            // Emit event for artifact handler (saves to debug/artifact dir)
            scraper.events.emit('logo:selected', {
                url: config.url,
                logos: result.logos,
                brandColors: result.brandColors
            });

            // Save all logos to a stable temp location for reference in the data packet
            const logosDir = path.join(tempDirectory, 'logos');
            await ensureDir(logosDir);

            // Counters for saving
            let savedLogosCount = 0;
            let savedFaviconsCount = 0;
            const savedLogoPaths: string[] = [];
            const savedFaviconPaths: string[] = [];

            for (let i = 0; i < result.logos.length; i++) {
                const logo = result.logos[i];
                
                // 1. Save to temp dir (always)
                const tempFilename = `logo_${i}.png`;
                const tempSavePath = path.join(logosDir, tempFilename);
                await ArtifactSaver.save(logo.base64PngData, tempSavePath);

                // 2. Determine if this is a favicon candidate (Square)
                const isSquare = Math.abs((logo.width || 0) - (logo.height || 0)) <= 1;
                
                // Route to Favicon ONLY if it is square AND we have a specific path for it
                const isFaviconTarget = isSquare && !!config.faviconOutputPath;

                const limit = isFaviconTarget ? config.maxFaviconsToSave : config.maxLogosToSave;
                const currentCount = isFaviconTarget ? savedFaviconsCount : savedLogosCount;
                const pathTemplate = isFaviconTarget ? config.faviconOutputPath : config.logoOutputPath;

                if (pathTemplate && currentCount < limit) {
                    let finalPath = pathTemplate;
                    
                    // Only append suffix if the user requested multiple
                    if (limit > 1) {
                        const ext = path.extname(pathTemplate);
                        const base = pathTemplate.slice(0, -ext.length);
                        // 1-based index for suffix
                        finalPath = `${base}_${currentCount + 1}${ext}`;
                    }

                    try {
                        await ArtifactSaver.save(logo.base64PngData, finalPath);
                        console.log(`[LogoScraper] Saved ${isFaviconTarget ? 'favicon' : 'logo'} to ${finalPath}`);

                        if (isFaviconTarget) {
                            savedFaviconsCount++;
                            savedFaviconPaths.push(finalPath);
                        } else {
                            savedLogosCount++;
                            savedLogoPaths.push(finalPath);
                        }

                        // Collect metadata for saved items
                        packetData.logoMetadata.push({
                            path: finalPath,
                            score: logo.brandLogoScore,
                            performance: logo.lightBackgroundPerformance,
                            isFavicon: isFaviconTarget,
                            width: logo.width,
                            height: logo.height
                        });
                    } catch (e: any) {
                        console.error(`[LogoScraper] Failed to save to ${finalPath}:`, e);
                    }
                }
            }

            // Populate packet data
            packetData.logo = savedLogoPaths.length > 0 ? savedLogoPaths[0] : undefined;
            packetData.favicon = savedFaviconPaths.length > 0 ? savedFaviconPaths[0] : undefined;
            packetData.logos = savedLogoPaths;
            packetData.favicons = savedFaviconPaths;
        }

        return {
            packets: [{
                data: packetData,
                contentParts: []
            }]
        };
    }
}
