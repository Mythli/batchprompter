import OpenAI from 'openai';
import { z } from 'zod';
import Handlebars from 'handlebars';
import * as path from 'path';
import { BasePlugin, BasePluginRow } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { PartialOutputConfigSchema, StepConfig, GlobalConfig } from '../../config/schema.js';
import { ModelConfigSchema, ModelConfig } from '../../config/model.js';
import { zHandlebars } from '../../config/validationRules.js';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';
import { ImageDownloader } from './utils/ImageDownloader.js';
import { LogoScraperPluginRow } from './LogoScraperPluginRow.js';

export const LogoScraperConfigSchemaV2 = z.object({
    type: z.literal('logoScraper'),
    id: z.string().optional(),
    output: PartialOutputConfigSchema.optional(),
    url: z.string(),
    logoOutputPath: zHandlebars.optional().describe("Template for the final logo image path."),
    faviconOutputPath: zHandlebars.optional().describe("Template for the final favicon image path."),
    analyzeModel: ModelConfigSchema.optional(),
    extractModel: ModelConfigSchema.optional(),
    maxLogosToAnalyze: z.number().int().positive().default(10),
    brandLogoScoreThreshold: z.number().int().positive().default(5)
}).strict();

export type LogoScraperConfig = z.output<typeof LogoScraperConfigSchemaV2>;

function fillModelDefaults(
    pluginModel: ModelConfig | undefined,
    globalModel: ModelConfig | undefined
): ModelConfig | undefined {
    if (!pluginModel) return undefined;
    
    return {
        ...pluginModel,
        model: pluginModel.model || globalModel?.model,
        temperature: pluginModel.temperature ?? globalModel?.temperature,
        reasoning_effort: pluginModel.reasoning_effort ?? globalModel?.reasoning_effort,
    };
}

function hydrateModelMessages(
    model: ModelConfig | undefined,
    context: Record<string, any>
): ModelConfig | undefined {
    if (!model) return undefined;

    return {
        ...model,
        messages: model.messages.map(msg => {
            if (typeof msg.content === 'string') {
                const compiled = Handlebars.compile(msg.content, { noEscape: true });
                return { ...msg, content: compiled(context) };
            }
            if (Array.isArray(msg.content)) {
                const hydratedContent = msg.content.map((part: any) => {
                    if (part.type === 'text') {
                        const compiled = Handlebars.compile(part.text, { noEscape: true });
                        return { ...part, text: compiled(context) };
                    }
                    return part;
                });
                return { ...msg, content: hydratedContent };
            }
            return msg;
        }) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    };
}

export class LogoScraperPlugin extends BasePlugin<LogoScraperConfig, LogoScraperConfig> {
    readonly type = 'logoScraper';

    constructor(
        private deps: {
            puppeteerHelper: PuppeteerHelper;
            imageDownloader: ImageDownloader;
        }
    ) {
        super();
    }

    getSchema() {
        return LogoScraperConfigSchemaV2;
    }

    normalizeConfig(config: LogoScraperConfig, stepConfig: StepConfig, globalConfig: GlobalConfig): LogoScraperConfig {
        const base = super.normalizeConfig(config, stepConfig, globalConfig);
        const globalModel = globalConfig.model;

        return {
            ...base,
            id: config.id ?? `logoScraper-${Date.now()}`,
            analyzeModel: fillModelDefaults(config.analyzeModel, globalModel),
            extractModel: fillModelDefaults(config.extractModel, globalModel),
        };
    }

    async hydrate(_stepConfig: StepConfig, _globalConfig: GlobalConfig, config: LogoScraperConfig, context: Record<string, any>): Promise<LogoScraperConfig> {
        const template = Handlebars.compile(config.url, { noEscape: true });
        const url = template(context);

        let logoOutputPath: string | undefined;
        if (config.logoOutputPath) {
            const logoTemplate = Handlebars.compile(config.logoOutputPath, { noEscape: true });
            logoOutputPath = path.resolve(logoTemplate(context));
        }

        let faviconOutputPath: string | undefined;
        if (config.faviconOutputPath) {
            const faviconTemplate = Handlebars.compile(config.faviconOutputPath, { noEscape: true });
            faviconOutputPath = path.resolve(faviconTemplate(context));
        }

        return {
            ...config,
            url,
            logoOutputPath,
            faviconOutputPath,
            analyzeModel: hydrateModelMessages(config.analyzeModel, context),
            extractModel: hydrateModelMessages(config.extractModel, context),
        };
    }

    createRow(stepRow: StepRow, config: LogoScraperConfig): BasePluginRow<LogoScraperConfig> {
        return new LogoScraperPluginRow(stepRow, config, this.deps.puppeteerHelper, this.deps.imageDownloader);
    }
}
