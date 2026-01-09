import { z } from 'zod';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import {
    Plugin,
    LlmFactory,
    PluginPacket
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, RawModelConfigSchema, DEFAULT_PLUGIN_OUTPUT, transformModelConfig } from '../../config/schemas/index.js';
import { makeSchemaOptional, renderSchemaObject } from '../../utils/schemaUtils.js';
import { AiWebsiteAgent } from './AiWebsiteAgent.js';
import { zJsonSchemaObject, zHandlebars } from '../../config/validationRules.js';
import { PluginScope } from '../PluginScope.js';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';
import PQueue from 'p-queue';
import { StepBaseConfig, GlobalsConfig } from '../../config/schema.js';

export const LooseWebsiteAgentConfigSchemaV2 = z.object({
    type: z.literal('website-agent'),
    id: z.string().optional(),
    output: OutputConfigSchema.default(DEFAULT_PLUGIN_OUTPUT),
    url: zHandlebars,
    schema: z.union([z.string(), zJsonSchemaObject]),
    budget: z.number().int().positive().default(1),
    batchSize: z.number().int().positive().default(3),
    navigator: RawModelConfigSchema.optional(),
    extract: RawModelConfigSchema.optional(),
    merge: RawModelConfigSchema.optional()
});

export type WebsiteAgentRawConfigV2 = z.infer<typeof LooseWebsiteAgentConfigSchemaV2>;

export interface WebsiteAgentResolvedConfigV2 {
    type: 'website-agent';
    id: string;
    output: ResolvedOutputConfig;
    url: string;
    schema: any;
    budget: number;
    batchSize: number;
    navigatorModel: ResolvedModelConfig;
    extractModel: ResolvedModelConfig;
    mergeModel: ResolvedModelConfig;
}

export interface WebsiteAgentHydratedConfigV2 extends Omit<WebsiteAgentResolvedConfigV2, 'url' | 'schema'> {
    url: string;
    schema: any;
}

export class WebsiteAgentPluginV2 implements Plugin<WebsiteAgentRawConfigV2, WebsiteAgentResolvedConfigV2, WebsiteAgentHydratedConfigV2> {
    readonly type = 'website-agent';
    readonly configSchema = LooseWebsiteAgentConfigSchemaV2;

    constructor(
        private deps: {
            puppeteerHelper: PuppeteerHelper;
            puppeteerQueue: PQueue;
            createLlm: LlmFactory;
        }
    ) {}

    getSchema(step: StepBaseConfig, globals: GlobalsConfig) {
        return LooseWebsiteAgentConfigSchemaV2.transform(config => {
            // Inherit defaults from step model
            const stepModel = step.model || {};
            
            const resolveModel = (modelConfig?: any) => {
                const merged = {
                    model: modelConfig?.model ?? stepModel.model,
                    temperature: modelConfig?.temperature ?? stepModel.temperature,
                    thinkingLevel: modelConfig?.thinkingLevel ?? stepModel.thinkingLevel,
                    system: modelConfig?.system,
                    prompt: modelConfig?.prompt
                };
                return transformModelConfig(merged);
            };

            return {
                type: 'website-agent' as const,
                id: config.id ?? `website-agent-${Date.now()}`,
                output: config.output,
                url: config.url,
                schema: config.schema,
                budget: config.budget,
                batchSize: config.batchSize,
                navigatorModel: resolveModel(config.navigator),
                extractModel: resolveModel(config.extract),
                mergeModel: resolveModel(config.merge)
            };
        });
    }

    async hydrate(config: WebsiteAgentResolvedConfigV2, context: Record<string, any>): Promise<WebsiteAgentHydratedConfigV2> {
        const template = Handlebars.compile(config.url, { noEscape: true });
        const url = template(context);

        let schema = config.schema;
        if (typeof schema === 'string') {
             try {
                 const schemaTemplate = Handlebars.compile(schema, { noEscape: true });
                 const resolvedSchema = schemaTemplate(context);
                 schema = JSON.parse(resolvedSchema);
             } catch (e: any) {
                 console.warn(`[WebsiteAgent] Failed to parse schema template:`, e);
             }
        } else {
            schema = renderSchemaObject(schema, context);
        }

        return {
            ...config,
            url,
            schema
        };
    }

    async prepare(stepRow: StepRow, config: WebsiteAgentHydratedConfigV2): Promise<PluginPacket[]> {
        const { context } = stepRow;

        const emit = (event: any, ...args: any[]) => {
            stepRow.step.globalContext.events.emit(event, ...args);
        };

        const puppeteerHelper = this.deps.puppeteerHelper;
        const puppeteerQueue = this.deps.puppeteerQueue;

        const extractionSchema = makeSchemaOptional(config.schema);

        const navigatorLlm = stepRow.createLlm(config.navigatorModel);
        const extractLlm = stepRow.createLlm(config.extractModel);
        const mergeLlm = stepRow.createLlm(config.mergeModel);

        const agent = new AiWebsiteAgent(
            navigatorLlm,
            extractLlm,
            mergeLlm,
            puppeteerHelper,
            puppeteerQueue
        );

        const scope = new PluginScope({
            row: context,
            stepIndex: stepRow.step.stepIndex,
            pluginIndex: 0,
            tempDirectory: stepRow.resolvedTempDir || '/tmp',
            emit: emit
        }, this.type);

        scope.bridge(agent.events);

        const result = await agent.scrapeIterative(
            config.url,
            extractionSchema,
            config.schema,
            {
                budget: config.budget,
                batchSize: config.batchSize,
                row: context
            }
        );

        emit('plugin:artifact', {
            row: stepRow.item.originalIndex,
            step: stepRow.step.stepIndex,
            plugin: 'website-agent',
            type: 'json',
            filename: `website_agent/result_${Date.now()}.json`,
            content: JSON.stringify(result, null, 2),
            tags: ['final', 'website-agent', 'result']
        });

        const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        if (result && Object.keys(result).length > 0) {
            contentParts.push({
                type: 'text',
                text: `\n--- Website Data from ${config.url} ---\n${JSON.stringify(result, null, 2)}\n--------------------------\n`
            });
        } else {
            contentParts.push({
                type: 'text',
                text: `\n--- Website Data from ${config.url} ---\nNo data extracted.\n--------------------------\n`
            });
        }

        return [{
            data: [result],
            contentParts
        }];
    }

    async postProcess(stepRow: StepRow, config: WebsiteAgentHydratedConfigV2, modelResult: any): Promise<PluginPacket[]> {
        return [{
            data: [modelResult],
            contentParts: []
        }];
    }
}
