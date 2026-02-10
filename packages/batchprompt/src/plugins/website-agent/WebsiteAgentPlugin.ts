import { z } from 'zod';
import Handlebars from 'handlebars';
import {
    BasePlugin,
    BasePluginRow
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { PartialOutputConfigSchema, StepConfig, GlobalConfig } from '../../config/schema.js';
import { ModelConfigSchema, ModelConfig } from '../../config/model.js';
import { zJsonSchemaObject, zHandlebars } from '../../config/validationRules.js';
import { renderSchemaObject } from '../../utils/schemaUtils.js';
import { WebsiteAgentPluginRow } from './WebsiteAgentPluginRow.js';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';
import PQueue from 'p-queue';

export const WebsiteAgentConfigSchema = z.object({
    type: z.literal('website-agent'),
    id: z.string().optional(),
    output: PartialOutputConfigSchema.optional(),
    url: zHandlebars.describe("The starting URL to scrape."),
    schema: z.union([zJsonSchemaObject, z.string()]).describe("JSON Schema for extraction."),
    budget: z.number().int().positive().default(10).describe("Max pages to visit."),
    batchSize: z.number().int().positive().default(3).describe("Pages to visit in parallel."),
    navigatorModel: ModelConfigSchema.optional(),
    extractModel: ModelConfigSchema.optional(),
    mergeModel: ModelConfigSchema.optional()
}).strict();

export type WebsiteAgentConfig = z.output<typeof WebsiteAgentConfigSchema>;

/**
 * Fills in missing model parameters from global defaults.
 */
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

export class WebsiteAgentPlugin extends BasePlugin<WebsiteAgentConfig, WebsiteAgentConfig> {
    readonly type = 'websiteAgent';

    constructor(
        private deps: {
            puppeteerHelper: PuppeteerHelper;
            puppeteerQueue: PQueue;
        }
    ) {
        super();
    }

    getSchema() {
        return WebsiteAgentConfigSchema;
    }

    normalizeConfig(config: WebsiteAgentConfig, stepConfig: StepConfig, globalConfig: GlobalConfig): WebsiteAgentConfig {
        const base = super.normalizeConfig(config, stepConfig, globalConfig);
        const globalModel = globalConfig.model;

        // If models are not provided, create default configs inheriting from global
        const defaultModelConfig = { model: globalModel?.model };

        return {
            ...base,
            id: config.id ?? `website-agent-${Date.now()}`,
            navigatorModel: fillModelDefaults(config.navigatorModel, globalModel) || defaultModelConfig,
            extractModel: fillModelDefaults(config.extractModel, globalModel) || defaultModelConfig,
            mergeModel: fillModelDefaults(config.mergeModel, globalModel) || defaultModelConfig,
        };
    }

    async hydrate(_stepConfig: StepConfig, _globalConfig: GlobalConfig, config: WebsiteAgentConfig, context: Record<string, any>): Promise<WebsiteAgentConfig> {
        // Render URL
        const urlTemplate = Handlebars.compile(config.url, { noEscape: true });
        const url = urlTemplate(context);

        // Render Schema
        let schema = config.schema;
        if (typeof schema === 'string') {
            try {
                const template = Handlebars.compile(schema, { noEscape: true });
                const renderedSchema = template(context);
                schema = JSON.parse(renderedSchema);
            } catch (e) {
                console.warn(`Failed to parse schema template in WebsiteAgent:`, e);
            }
        } else {
            try {
                schema = renderSchemaObject(schema, context);
            } catch (e) {
                console.warn(`Failed to render schema templates in WebsiteAgent:`, e);
            }
        }

        return {
            ...config,
            url,
            schema
        };
    }

    createRow(stepRow: StepRow, config: WebsiteAgentConfig): BasePluginRow<WebsiteAgentConfig> {
        return new WebsiteAgentPluginRow(stepRow, config, this.deps.puppeteerHelper, this.deps.puppeteerQueue);
    }
}
