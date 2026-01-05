import { z } from 'zod';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import {
    Plugin,
    PluginExecutionContext,
    PluginResult
} from '../types.js';
import { ServiceCapabilities, ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, PromptDefSchema } from '../../config/common.js';
import { PromptLoader } from '../../config/PromptLoader.js';
import { makeSchemaOptional, renderSchemaObject } from '../../utils/schemaUtils.js';
import { AiWebsiteAgent } from '../../utils/AiWebsiteAgent.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';
import { zJsonSchemaObject, zHandlebars } from '../../config/validationRules.js';
import { PluginScope } from '../PluginScope.js';

// =============================================================================
// Config Schema
// =============================================================================

// Strict Schema (Object only)
export const WebsiteAgentConfigSchemaV2 = z.object({
    type: z.literal('website-agent').describe("Identifies this as a Website Agent plugin."),
    id: z.string().optional().describe("Unique ID for this plugin instance."),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }).describe("How to save the extracted data."),
    url: zHandlebars.describe("The starting URL to scrape. Supports Handlebars."),
    schema: zJsonSchemaObject.describe("The JSON Schema defining the data to extract."),
    budget: z.number().int().positive().default(10).describe("Maximum number of pages to visit per website."),
    batchSize: z.number().int().positive().default(3).describe("Number of pages to visit in parallel during each iteration."),

    // Navigator model config
    navigatorModel: z.string().optional().describe("Model used by the Navigator agent."),
    navigatorTemperature: z.number().min(0).max(2).optional().describe("Temperature for the Navigator."),
    navigatorThinkingLevel: z.enum(['low', 'medium', 'high']).optional().describe("Thinking level for the Navigator."),
    navigatorPrompt: PromptDefSchema.optional().describe("Custom instructions for the Navigator."),
    navigatorSystem: PromptDefSchema.optional().describe("System prompt for the Navigator."),

    // Extract model config
    extractModel: z.string().optional().describe("Model used by the Extractor agent."),
    extractTemperature: z.number().min(0).max(2).optional().describe("Temperature for the Extractor."),
    extractThinkingLevel: z.enum(['low', 'medium', 'high']).optional().describe("Thinking level for the Extractor."),
    extractPrompt: PromptDefSchema.optional().describe("Custom instructions for the Extractor."),
    extractSystem: PromptDefSchema.optional().describe("System prompt for the Extractor."),

    // Merge model config
    mergeModel: z.string().optional().describe("Model used by the Merger agent."),
    mergeTemperature: z.number().min(0).max(2).optional().describe("Temperature for the Merger."),
    mergeThinkingLevel: z.enum(['low', 'medium', 'high']).optional().describe("Thinking level for the Merger."),
    mergePrompt: PromptDefSchema.optional().describe("Custom instructions for the Merger."),
    mergeSystem: PromptDefSchema.optional().describe("System prompt for the Merger.")
}).describe("Configuration for the Website Agent plugin.");

// Loose Schema (String or Object)
export const LooseWebsiteAgentConfigSchemaV2 = WebsiteAgentConfigSchemaV2.extend({
    schema: z.union([z.string(), zJsonSchemaObject])
});

export type WebsiteAgentRawConfigV2 = z.infer<typeof LooseWebsiteAgentConfigSchemaV2>;

export interface WebsiteAgentResolvedConfigV2 {
    type: 'website-agent';
    id: string;
    output: ResolvedOutputConfig;
    url: string;
    schema: any;
    extractionSchema: any;
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
    // We use the Loose schema for the plugin interface to allow CLI/File inputs
    readonly configSchema = LooseWebsiteAgentConfigSchemaV2;

    constructor(private promptLoader: PromptLoader) {}

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return ['hasPuppeteer'];
    }

    async normalizeConfig(
        config: WebsiteAgentRawConfigV2,
        contentResolver: ContentResolver
    ): Promise<WebsiteAgentRawConfigV2> {
        if (typeof config.schema === 'string') {
            // If it looks like a template, skip static loading
            if (config.schema.includes('{{')) {
                return config;
            }

            try {
                const content = await contentResolver.readText(config.schema);
                return {
                    ...config,
                    schema: JSON.parse(content)
                };
            } catch (e: any) {
                throw new Error(`Failed to load schema from '${config.schema}': ${e.message}`);
            }
        }
        return config;
    }

    async resolveConfig(
        rawConfig: WebsiteAgentRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' },
        contentResolver: ContentResolver
    ): Promise<WebsiteAgentResolvedConfigV2> {
        
        const resolveModelWithPrompt = async (
            prompt: any,
            defaultPrompt: string,
            modelOverride?: string,
            temperatureOverride?: number,
            thinkingLevelOverride?: 'low' | 'medium' | 'high'
        ): Promise<ResolvedModelConfig> => {
            let parts: OpenAI.Chat.Completions.ChatCompletionContentPart[];

            if (prompt) {
                parts = await this.promptLoader.load(prompt);
                parts = parts.map((part: any) => {
                    if (part.type === 'text') {
                        const template = Handlebars.compile(part.text, { noEscape: true });
                        return { type: 'text' as const, text: template(row) };
                    }
                    return part;
                });
            } else {
                parts = [{ type: 'text', text: defaultPrompt }];
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

        let schema = rawConfig.schema;
        if (typeof schema === 'string') {
             throw new Error("Schema must be an object. Ensure ConfigNormalizer is used.");
        }

        // Render schema templates
        schema = renderSchemaObject(schema, row);

        const extractionSchema = makeSchemaOptional(schema);

        return {
            type: 'website-agent',
            id: rawConfig.id ?? `website-agent-${Date.now()}`,
            output: {
                mode: rawConfig.output.mode,
                column: rawConfig.output.column,
                explode: rawConfig.output.explode
            },
            url,
            schema,
            extractionSchema,
            budget: rawConfig.budget,
            batchSize: rawConfig.batchSize,
            navigatorModel: await resolveModelWithPrompt(
                rawConfig.navigatorPrompt,
                DEFAULT_NAVIGATOR,
                rawConfig.navigatorModel,
                rawConfig.navigatorTemperature,
                rawConfig.navigatorThinkingLevel
            ),
            extractModel: await resolveModelWithPrompt(
                rawConfig.extractPrompt,
                DEFAULT_EXTRACT,
                rawConfig.extractModel,
                rawConfig.extractTemperature,
                rawConfig.extractThinkingLevel
            ),
            mergeModel: await resolveModelWithPrompt(
                rawConfig.mergePrompt,
                DEFAULT_MERGE,
                rawConfig.mergeModel,
                rawConfig.mergeTemperature,
                rawConfig.mergeThinkingLevel
            )
        };
    }

    async execute(
        config: WebsiteAgentResolvedConfigV2,
        context: PluginExecutionContext
    ): Promise<PluginResult> {
        const { services, row } = context;
        const { puppeteerHelper, puppeteerQueue } = services;

        if (!puppeteerHelper || !puppeteerQueue) {
            throw new Error('[WebsiteAgent] Puppeteer not available');
        }

        if (!config.url || config.url.trim() === '') {
            throw new Error('[WebsiteAgent] No URL provided');
        }

        const urlRegex = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
        if (!urlRegex.test(config.url)) {
            throw new Error(`[WebsiteAgent] Invalid URL: ${config.url}`);
        }

        const navLlm = services.createLlm(config.navigatorModel);
        const extLlm = services.createLlm(config.extractModel);
        const mrgLlm = services.createLlm(config.mergeModel);

        const agent = new AiWebsiteAgent(navLlm, extLlm, mrgLlm, puppeteerHelper, puppeteerQueue);
        const scope = new PluginScope(context, this.type);

        // Bridge all agent events to the plugin scope
        scope.bridge(agent.events);

        // Handle artifacts specifically if needed, or rely on the bridge if the agent emits 'artifact'
        // The agent emits specific events like 'page:scraped'. We can listen to them to save artifacts.

        agent.events.on('page:scraped', (data) => {
            const safeUrl = data.url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            scope.artifact({
                type: 'text',
                filename: `website_agent/pages/${safeUrl}_${Date.now()}.md`,
                content: data.markdown,
                tags: ['debug', 'website-agent', 'page']
            });
        });

        agent.events.on('data:extracted', (data) => {
            const safeUrl = data.url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            scope.artifact({
                type: 'json',
                filename: `website_agent/extractions/${safeUrl}_${Date.now()}.json`,
                content: JSON.stringify(data.data, null, 2),
                tags: ['debug', 'website-agent', 'extraction']
            });
        });

        agent.events.on('decision:made', (data) => {
            scope.artifact({
                type: 'json',
                filename: `website_agent/decisions/decision_${Date.now()}.json`,
                content: JSON.stringify(data, null, 2),
                tags: ['debug', 'website-agent', 'decision']
            });
        });

        agent.events.on('results:merged', (data) => {
            scope.artifact({
                type: 'json',
                filename: `website_agent/final/final_merge_${Date.now()}.json`,
                content: JSON.stringify(data.merged, null, 2),
                tags: ['final', 'website-agent', 'merged']
            });
        });

        const result = await agent.scrapeIterative(
            config.url,
            config.extractionSchema,
            config.schema,
            {
                budget: config.budget,
                batchSize: config.batchSize,
                row
            }
        );

        return {
            packets: [{
                data: result,
                contentParts: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }]
            }]
        };
    }
}
