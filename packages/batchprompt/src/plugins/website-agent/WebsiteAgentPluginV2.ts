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
import { PromptLoader } from '../../config/PromptLoader.js';
import { makeSchemaOptional, renderSchemaObject } from '../../utils/schemaUtils.js';
import { AiWebsiteAgent } from './AiWebsiteAgent.js';
import { zJsonSchemaObject, zHandlebars } from '../../config/validationRules.js';
import { PluginScope } from '../PluginScope.js';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';
import PQueue from 'p-queue';

// =============================================================================
// Config Schema
// =============================================================================

export const LooseWebsiteAgentConfigSchemaV2 = z.object({
    type: z.literal('website-agent').describe("Identifies this as a Website Agent plugin."),
    id: z.string().optional().describe("Unique ID for this plugin instance."),
    output: OutputConfigSchema.default(DEFAULT_PLUGIN_OUTPUT).describe("How to save the extracted data."),

    // Required fields
    url: zHandlebars.describe("The starting URL to scrape. Supports Handlebars."),
    schema: z.union([z.string(), zJsonSchemaObject]).describe("The JSON Schema defining the data to extract. Can be inline object or file path."),

    // Options
    budget: z.number().int().positive().default(10).describe("Maximum number of pages to visit per website."),
    batchSize: z.number().int().positive().default(3).describe("Number of pages to visit in parallel during each iteration."),

    // Nested model configs
    navigator: BaseModelConfigSchema.optional().describe("Model configuration for the Navigator agent (decides which links to click)."),
    extract: BaseModelConfigSchema.optional().describe("Model configuration for the Extractor agent (reads page content)."),
    merge: BaseModelConfigSchema.optional().describe("Model configuration for the Merger agent (consolidates data).")
}).describe("Configuration for the Website Agent plugin.");

export const WebsiteAgentConfigSchemaV2 = LooseWebsiteAgentConfigSchemaV2.extend({
    schema: zJsonSchemaObject.describe("The JSON Schema defining the data to extract.")
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

// =============================================================================
// Plugin
// =============================================================================

const DEFAULT_NAVIGATOR = 'You are an autonomous web scraper. Analyze findings and available links to decide which pages to visit next.';
const DEFAULT_EXTRACT = 'You are a data extraction expert. Extract information from the website content to populate the JSON schema. Return null for any fields where information is not available on this page.';
const DEFAULT_MERGE = 'You are a data consolidation expert. Merge the JSON objects into a single comprehensive object. Use the most complete and accurate values from each source.';

export class WebsiteAgentPluginV2 implements Plugin<WebsiteAgentRawConfigV2, WebsiteAgentResolvedConfigV2> {
    readonly type = 'website-agent';
    readonly configSchema = LooseWebsiteAgentConfigSchemaV2;

    constructor(
        private deps: {
            promptLoader: PromptLoader;
            puppeteerHelper: PuppeteerHelper;
            puppeteerQueue: PQueue;
            createLlm: LlmFactory;
        }
    ) {}

    private async resolvePluginModel(
        step: Step,
        config: z.infer<typeof BaseModelConfigSchema> | undefined,
        defaultPrompt: string
    ): Promise<ResolvedModelConfig> {
        let promptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];

        if (config?.prompt) {
            promptParts = await step.loadPrompt(config.prompt);
        } else {
            promptParts = [{ type: 'text', text: defaultPrompt }];
        }

        const systemParts = config?.system ? await step.loadPrompt(config.system) : [];

        return {
            model: config?.model,
            temperature: config?.temperature,
            thinkingLevel: config?.thinkingLevel,
            systemParts,
            promptParts
        };
    }

    async init(step: Step, rawConfig: WebsiteAgentRawConfigV2): Promise<WebsiteAgentResolvedConfigV2> {
        let schema = rawConfig.schema;
        
        // Load schema if it's a file path (and not a template)
        if (typeof schema === 'string' && !schema.includes('{{')) {
            try {
                const content = await step.globalContext.contentResolver.readText(schema);
                schema = JSON.parse(content);
            } catch (e: any) {
                throw new Error(`Failed to load schema from '${schema}': ${e.message}`);
            }
        }

        return {
            type: 'website-agent',
            id: rawConfig.id ?? `website-agent-${Date.now()}`,
            output: {
                mode: rawConfig.output.mode,
                column: rawConfig.output.column,
                explode: rawConfig.output.explode
            },
            url: rawConfig.url,
            schema,
            budget: rawConfig.budget,
            batchSize: rawConfig.batchSize,
            navigatorModel: await this.resolvePluginModel(step, rawConfig.navigator, DEFAULT_NAVIGATOR),
            extractModel: await this.resolvePluginModel(step, rawConfig.extract, DEFAULT_EXTRACT),
            mergeModel: await this.resolvePluginModel(step, rawConfig.merge, DEFAULT_MERGE)
        };
    }

    async prepare(stepRow: StepRow, config: WebsiteAgentResolvedConfigV2): Promise<void> {
        const { context } = stepRow;
        const emit = stepRow.step.globalContext.events.emit.bind(stepRow.step.globalContext.events);
        const puppeteerHelper = this.deps.puppeteerHelper;
        const puppeteerQueue = this.deps.puppeteerQueue;

        // Resolve URL template
        const url = stepRow.render(config.url);

        // Resolve Schema template (if it was a string template or object with templates)
        let schema = config.schema;
        if (typeof schema === 'string') {
             // It must be a template string if it wasn't resolved in init
             try {
                 const template = Handlebars.compile(schema, { noEscape: true });
                 const resolvedPath = template(context);
                 const content = await stepRow.step.globalContext.contentResolver.readText(resolvedPath);
                 schema = JSON.parse(content);
             } catch (e: any) {
                 console.warn(`[WebsiteAgent] Failed to load schema from template:`, e);
             }
        } else {
            schema = renderSchemaObject(schema, context);
        }

        // Create extraction schema
        const extractionSchema = makeSchemaOptional(schema);

        // Create LLM clients
        const navigatorLlm = stepRow.createLlm(config.navigatorModel);
        const extractLlm = stepRow.createLlm(config.extractModel);
        const mergeLlm = stepRow.createLlm(config.mergeModel);

        // Create the agent
        const agent = new AiWebsiteAgent(
            navigatorLlm,
            extractLlm,
            mergeLlm,
            puppeteerHelper,
            puppeteerQueue
        );

        // Bridge events
        // We need a temporary scope to bridge events to the global emitter with context
        const scope = new PluginScope({
            row: context,
            stepIndex: stepRow.step.stepIndex,
            pluginIndex: 0,
            tempDirectory: stepRow.resolvedTempDir || '/tmp',
            emit: emit
        }, this.type);
        
        scope.bridge(agent.events);

        console.log(`[WebsiteAgent] Starting scrape of: ${url}`);

        // Execute the scrape
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

        // Emit artifact
        emit('plugin:artifact', {
            row: stepRow.item.originalIndex,
            step: stepRow.step.stepIndex,
            plugin: 'website-agent',
            type: 'json',
            filename: `website_agent/result_${Date.now()}.json`,
            content: JSON.stringify(result, null, 2),
            tags: ['final', 'website-agent', 'result']
        });

        // Add content to prompt
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
        
        stepRow.appendContent(contentParts);
        stepRow.context._websiteAgent_result = result;
    }

    async postProcess(stepRow: StepRow, config: WebsiteAgentResolvedConfigV2, modelResult: any): Promise<any> {
        const result = stepRow.context._websiteAgent_result;
        if (result && (modelResult === null || modelResult === undefined)) {
            return result;
        }
        return modelResult;
    }
}
