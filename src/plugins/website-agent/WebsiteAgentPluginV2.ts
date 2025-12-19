import { z } from 'zod';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import {
    Plugin,
    PluginExecutionContext,
    PluginResult,
    CLIOptionDefinition
} from '../types.js';
import { ServiceCapabilities, ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, createFlatModelSchema } from '../../config/common.js';
import { PromptLoader } from '../../config/PromptLoader.js';
import { SchemaLoader } from '../../config/SchemaLoader.js';
import { makeSchemaOptional } from '../../utils/schemaUtils.js';
import { ModelFlags } from '../../cli/ModelFlags.js';
import { AiWebsiteAgent } from '../../utils/AiWebsiteAgent.js';
import { WebsiteAgentArtifactHandler } from './WebsiteAgentArtifactHandler.js';
import path from 'path';
import { ensureDir } from '../../utils/fileUtils.js';

// =============================================================================
// Config Schema (Single source of truth for defaults)
// =============================================================================

export const WebsiteAgentConfigSchemaV2 = z.object({
    type: z.literal('website-agent'),
    id: z.string().optional(),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }),
    url: z.string(),
    schema: z.union([z.string(), z.record(z.string(), z.any())]),
    budget: z.number().int().positive().default(10),
    batchSize: z.number().int().positive().default(3),
    
    // Navigator model config
    ...createFlatModelSchema('navigator'),
    
    // Extract model config
    ...createFlatModelSchema('extract'),
    
    // Merge model config
    ...createFlatModelSchema('merge')
});

export type WebsiteAgentRawConfigV2 = z.infer<typeof WebsiteAgentConfigSchemaV2>;

export interface WebsiteAgentResolvedConfigV2 {
    type: 'website-agent';
    id: string;
    output: ResolvedOutputConfig;
    url: string;
    schema: any;
    /** Relaxed schema with all fields optional/nullable for page extractions */
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
    readonly configSchema = WebsiteAgentConfigSchemaV2;

    private promptLoader = new PromptLoader();
    private schemaLoader = new SchemaLoader();

    readonly cliOptions: CLIOptionDefinition[] = [
        // Navigator model options
        ...ModelFlags.getOptions('website-navigator', { includePrompt: true }),
        // Extract model options
        ...ModelFlags.getOptions('website-extract', { includePrompt: true }),
        // Merge model options
        ...ModelFlags.getOptions('website-merge', { includePrompt: true }),
        // Agent options
        { flags: '--website-agent-url <url>', description: 'Starting URL to scrape' },
        { flags: '--website-agent-schema <path>', description: 'JSON Schema for extraction' },
        { flags: '--website-agent-budget <number>', description: 'Max pages to visit (default: 10)', parser: parseInt },
        { flags: '--website-agent-batch-size <number>', description: 'Pages per batch (default: 3)', parser: parseInt },
        // Output options
        { flags: '--website-agent-export', description: 'Merge results into row' },
        { flags: '--website-agent-output <column>', description: 'Save to column' }
    ];

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return ['hasPuppeteer'];
    }

    parseCLIOptions(options: Record<string, any>, stepIndex: number): WebsiteAgentRawConfigV2 | null {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const url = getOpt('websiteAgentUrl');
        if (!url) return null;

        // Extract model configs using helper
        const navigatorConfig = ModelFlags.extractPluginModel(options, 'websiteNavigator', stepIndex);
        const extractConfig = ModelFlags.extractPluginModel(options, 'websiteExtract', stepIndex);
        const mergeConfig = ModelFlags.extractPluginModel(options, 'websiteMerge', stepIndex);

        const exportFlag = getOpt('websiteAgentExport');
        const outputColumn = getOpt('websiteAgentOutput');

        let outputMode: 'merge' | 'column' | 'ignore' = 'ignore';
        if (outputColumn) outputMode = 'column';
        else if (exportFlag) outputMode = 'merge';

        // Return raw config - Zod will apply defaults
        const partialConfig = {
            type: 'website-agent',
            url,
            schema: getOpt('websiteAgentSchema'),
            budget: getOpt('websiteAgentBudget'),
            batchSize: getOpt('websiteAgentBatchSize'),
            // Navigator model
            navigatorPrompt: navigatorConfig.prompt,
            navigatorModel: navigatorConfig.model,
            navigatorTemperature: navigatorConfig.temperature,
            navigatorThinkingLevel: navigatorConfig.thinkingLevel,
            // Extract model
            extractPrompt: extractConfig.prompt,
            extractModel: extractConfig.model,
            extractTemperature: extractConfig.temperature,
            extractThinkingLevel: extractConfig.thinkingLevel,
            // Merge model
            mergePrompt: mergeConfig.prompt,
            mergeModel: mergeConfig.model,
            mergeTemperature: mergeConfig.temperature,
            mergeThinkingLevel: mergeConfig.thinkingLevel,
            output: {
                mode: outputMode,
                column: outputColumn,
                explode: false
            }
        };

        // Parse through Zod to apply defaults
        return this.configSchema.parse(partialConfig);
    }

    async resolveConfig(
        rawConfig: WebsiteAgentRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
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
                parts = parts.map(part => {
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

        // Resolve URL
        const urlTemplate = Handlebars.compile(rawConfig.url, { noEscape: true });
        const url = urlTemplate(row);

        // Resolve schema
        let schema: any;
        if (typeof rawConfig.schema === 'string') {
            schema = await this.schemaLoader.loadWithContext(rawConfig.schema, row);
        } else if (rawConfig.schema) {
            schema = rawConfig.schema;
        } else {
            schema = {
                type: 'object',
                properties: {
                    summary: { type: 'string', description: 'Summary of the website content' }
                },
                required: ['summary']
            };
        }

        // Create relaxed schema for page extractions
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
        const { services, row, tempDirectory } = context;
        const { puppeteerHelper, puppeteerQueue } = services;

        if (!puppeteerHelper || !puppeteerQueue) {
            throw new Error('[WebsiteAgent] Puppeteer not available');
        }

        // Validate URL
        if (!config.url || config.url.trim() === '') {
            throw new Error('[WebsiteAgent] No URL provided');
        }

        const urlRegex = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
        if (!urlRegex.test(config.url)) {
            throw new Error(`[WebsiteAgent] Invalid URL: ${config.url}`);
        }

        // Create LLM clients
        const navLlm = services.createLlm(config.navigatorModel);
        const extLlm = services.createLlm(config.extractModel);
        const mrgLlm = services.createLlm(config.mergeModel);

        // Setup utility
        const agent = new AiWebsiteAgent(navLlm, extLlm, mrgLlm, puppeteerHelper, puppeteerQueue);

        // Setup artifact handler
        const artifactDir = path.join(tempDirectory, 'website_agent');
        await ensureDir(artifactDir + '/x');
        new WebsiteAgentArtifactHandler(artifactDir, agent.events);

        // Scrape
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
