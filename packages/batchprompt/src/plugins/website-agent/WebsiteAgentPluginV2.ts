import { z } from 'zod';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import {
    Plugin,
    PluginExecutionContext,
    PluginPacket
} from '../types.js';
import { ServiceCapabilities, ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, PluginModelConfigSchema, DEFAULT_PLUGIN_OUTPUT } from '../../config/schemas/index.js';
import { PromptLoader } from '../../config/PromptLoader.js';
import { makeSchemaOptional, renderSchemaObject } from '../../utils/schemaUtils.js';
import { AiWebsiteAgent } from '../../utils/AiWebsiteAgent.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';
import { zJsonSchemaObject, zHandlebars } from '../../config/validationRules.js';
import { PluginScope } from '../PluginScope.js';

// =============================================================================
// Config Schema
// =============================================================================

// Loose Schema (String or Object for schema field) - defined first as base
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
    navigator: PluginModelConfigSchema.optional().describe("Model configuration for the Navigator agent (decides which links to click)."),
    extract: PluginModelConfigSchema.optional().describe("Model configuration for the Extractor agent (reads page content)."),
    merge: PluginModelConfigSchema.optional().describe("Model configuration for the Merger agent (consolidates data).")
}).describe("Configuration for the Website Agent plugin.");

// Strict Schema (Object only) - derived by narrowing the schema field
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

    private async resolvePluginModel(
        config: z.infer<typeof PluginModelConfigSchema> | undefined,
        defaultPrompt: string,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
    ): Promise<ResolvedModelConfig> {
        let promptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];

        if (config?.prompt) {
            promptParts = await this.promptLoader.load(config.prompt as any);
            promptParts = promptParts.map((part: any) => {
                if (part.type === 'text') {
                    const template = Handlebars.compile(part.text, { noEscape: true });
                    return { type: 'text' as const, text: template(row) };
                }
                return part;