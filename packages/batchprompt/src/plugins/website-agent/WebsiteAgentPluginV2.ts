import { z } from 'zod';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import {
    Plugin,
    LlmFactory,
    PluginPacket
} from '../types.js';
import { Step } from '../../Step.js';
import { StepRow } from '../../StepRow.js';
import { ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, RawModelConfigSchema, DEFAULT_PLUGIN_OUTPUT } from '../../config/schemas/index.js';
import { makeSchemaOptional, renderSchemaObject } from '../../utils/schemaUtils.js';
import { AiWebsiteAgent } from './AiWebsiteAgent.js';
import { zJsonSchemaObject, zHandlebars } from '../../config/validationRules.js';
import { PluginScope } from '../PluginScope.js';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';
import PQueue from 'p-queue';

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

export const WebsiteAgentConfigSchemaV2 = LooseWebsiteAgentConfigSchemaV2.extend({
    schema: zJsonSchemaObject
}).strict();

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

export class WebsiteAgentPluginV2 implements Plugin<WebsiteAgentRawConfigV2, WebsiteAgentResolvedConfigV2> {
    readonly type = 'website-agent';
    readonly configSchema = LooseWebsiteAgentConfigSchemaV2;

    constructor(
        private deps: {
            puppeteerHelper: PuppeteerHelper;
            puppeteerQueue: PQueue;
            createLlm: LlmFactory;
        }
    ) {}

    async init(step: Step, rawConfig: any): Promise<WebsiteAgentResolvedConfigV2> {
        return {
            type: 'website-agent',
            id: rawConfig.id ?? `website-agent-${Date.now()}`,
            output: rawConfig.output,
            url: rawConfig.url,
            schema: rawConfig.schema,
            budget: rawConfig.budget,
            batchSize: rawConfig.batchSize,
            navigatorModel: rawConfig.navigator,
            extractModel: rawConfig.extract,
            mergeModel: rawConfig.merge
        };
    }

    async prepare(stepRow: StepRow, config: WebsiteAgentResolvedConfigV2): Promise<PluginPacket[]> {
        const { context } = stepRow;

        const emit = (event: any, ...args: any[]) => {
            stepRow.step.globalContext.events.emit(event, ...args);
        };

        const puppeteerHelper = this.deps.puppeteerHelper;
        const puppeteerQueue = this.deps.puppeteerQueue;

        const url = stepRow.render(config.url);

        let schema = config.schema;
        if (typeof schema === 'string') {
             try {
                 const template = Handlebars.compile(schema, { noEscape: true });
                 const resolvedSchema = template(context);
                 schema = JSON.parse(resolvedSchema);
             } catch (e: any) {
                 console.warn(`[WebsiteAgent] Failed to parse schema template:`, e);
             }
        } else {
            schema = renderSchemaObject(schema, context);
        }

        const extractionSchema = makeSchemaOptional(schema);

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
            url,
            extractionSchema,
            schema,
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
                text: `\n--- Website Data from ${url} ---\n${JSON.stringify(result, null, 2)}\n--------------------------\n`
            });
        } else {
            contentParts.push({
                type: 'text',
                text: `\n--- Website Data from ${url} ---\nNo data extracted.\n--------------------------\n`
            });
        }

        return [{
            data: [result],
            contentParts
        }];
    }

    async postProcess(stepRow: StepRow, config: WebsiteAgentResolvedConfigV2, modelResult: any): Promise<PluginPacket[]> {
        return [{
            data: [modelResult],
            contentParts: []
        }];
    }
}
