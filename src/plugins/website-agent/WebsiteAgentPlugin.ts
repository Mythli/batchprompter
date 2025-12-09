import { Command } from 'commander';
import OpenAI from 'openai';
import Handlebars from 'handlebars';
import { ContentProviderPlugin, PluginContext, PluginResult, NormalizedPluginConfig } from '../types.js';
import { PromptResolver } from '../../utils/PromptResolver.js';
import { SchemaHelper } from '../../utils/SchemaHelper.js';
import { ModelFlags } from '../../cli/ModelFlags.js';
import { ModelDefinition, ResolvedModelConfig } from '../../types.js';
import { PluginHelpers } from '../../utils/PluginHelpers.js';

// Default Prompts
const DEFAULT_NAVIGATOR_PROMPT = `You are an autonomous web scraper. Your goal is to find information to populate the provided schema.

Schema Description:
{{schemaDescription}}

Status:
- Pages Visited: {{visitedCount}}
- Remaining Budget: {{budget}}

Current Findings (Merged State):
{{currentData}}

Available Links:
{{linksText}}

Instructions:
1. Analyze the "Current Findings". Do you have sufficient information for all fields in the schema?
2. If yes, set 'is_done' to true.
3. If no, select the most promising URLs from "Available Links" to visit next.
4. You can select up to {{batchSize}} links to visit in parallel. Prioritize pages likely to contain missing information (e.g., "About", "Contact", "Team").
5. If no relevant links are left, set 'is_done' to true.`;

const DEFAULT_EXTRACT_DATA = `You are given the website content of {{url}} (converted to markdown). Your primary goal is to extract information from this content to accurately populate the provided JSON schema.

Website content:
{{truncatedMarkdown}}`;

const DEFAULT_MERGE_DATA = `You are a data consolidation expert. Merge the following JSON objects extracted from different pages of the same website into a single comprehensive object adhering to the schema.

Objects:
{{jsonObjects}}`;

interface WebsiteAgentRawConfig {
    url?: string;
    schemaPath?: string;
    budget: number;
    batchSize: number;
    navigatorConfig: ModelDefinition;
    extractConfig: ModelDefinition;
    mergeConfig: ModelDefinition;
}

interface WebsiteAgentResolvedConfig {
    url: string;
    schema: any; // JSON Schema object
    budget: number;
    batchSize: number;
    navigatorConfig: ResolvedModelConfig;
    extractConfig: ResolvedModelConfig;
    mergeConfig: ResolvedModelConfig;
}

export class WebsiteAgentPlugin implements ContentProviderPlugin {
    name = 'website-agent';

    constructor() {}

    register(program: Command): void {
        program.option('--website-agent-url <url>', 'Starting URL for the agent');
        program.option('--website-agent-schema <path>', 'Path to JSON schema for extraction');
        program.option('--website-agent-budget <number>', 'Max pages to visit', '10');
        program.option('--website-agent-batch-size <number>', 'Max pages to visit in parallel per step', '3');

        // Register Model Flags
        ModelFlags.register(program, 'website-navigator', { includePrompt: true });
        ModelFlags.register(program, 'website-extract', { includePrompt: true });
        ModelFlags.register(program, 'website-merge', { includePrompt: true });
    }

    registerStep(program: Command, stepIndex: number): void {
        program.option(`--website-agent-url-${stepIndex} <url>`, `Starting URL for step ${stepIndex}`);
        program.option(`--website-agent-schema-${stepIndex} <path>`, `Schema path for step ${stepIndex}`);
        program.option(`--website-agent-budget-${stepIndex} <number>`, `Budget for step ${stepIndex}`);
        program.option(`--website-agent-batch-size-${stepIndex} <number>`, `Batch size for step ${stepIndex}`);

        ModelFlags.register(program, `website-navigator-${stepIndex}`, { includePrompt: true });
        ModelFlags.register(program, `website-extract-${stepIndex}`, { includePrompt: true });
        ModelFlags.register(program, `website-merge-${stepIndex}`, { includePrompt: true });
    }

    normalize(options: Record<string, any>, stepIndex: number, globalConfig: any): NormalizedPluginConfig | undefined {
        const getOpt = (key: string) => {
            const specific = options[`${key}${stepIndex}`];
            if (specific !== undefined) return specific;
            return options[key];
        };

        const url = getOpt('websiteAgentUrl');
        const schemaPath = getOpt('websiteAgentSchema');

        if (!url) return undefined;

        // Helper to extract model config
        const modelFlags = new ModelFlags(globalConfig.model);
        const extractModel = (namespace: string, fallbackNamespace: string): ModelDefinition => {
            const config = modelFlags.extract(options, namespace, fallbackNamespace);
            // Ensure we have a model, defaulting to global if not set
            if (!config.model) config.model = globalConfig.model;
            return config as ModelDefinition;
        };

        const config: WebsiteAgentRawConfig = {
            url,
            schemaPath,
            budget: parseInt(getOpt('websiteAgentBudget') || '10', 10),
            batchSize: parseInt(getOpt('websiteAgentBatchSize') || '3', 10),
            navigatorConfig: extractModel(`website-navigator-${stepIndex}`, 'website-navigator'),
            extractConfig: extractModel(`website-extract-${stepIndex}`, 'website-extract'),
            mergeConfig: extractModel(`website-merge-${stepIndex}`, 'website-merge')
        };

        return {
            config
        };
    }

    async prepare(config: WebsiteAgentRawConfig, row: Record<string, any>): Promise<WebsiteAgentResolvedConfig> {
        const urlTemplate = config.url || '';
        const url = Handlebars.compile(urlTemplate, { noEscape: true })(row);

        let schema: any;
        if (config.schemaPath) {
            try {
                schema = await SchemaHelper.loadAndRenderSchema(config.schemaPath, row);
            } catch (e: any) {
                throw new Error(`[WebsiteAgent] ${e.message}`);
            }
        }

        if (!schema) {
            schema = {
                type: "object",
                properties: {
                    summary: { type: "string", description: "A comprehensive summary of the website content." },
                    key_points: { type: "array", items: { type: "string" } }
                },
                required: ["summary"]
            };
        }

        // Resolve Model Configs
        const navigatorConfig = await PluginHelpers.resolveModelConfig(config.navigatorConfig, row);
        const extractConfig = await PluginHelpers.resolveModelConfig(config.extractConfig, row);
        const mergeConfig = await PluginHelpers.resolveModelConfig(config.mergeConfig, row);

        // Apply Default Prompts if none provided
        if (navigatorConfig.promptParts.length === 0) {
            navigatorConfig.promptParts = [{ type: 'text', text: DEFAULT_NAVIGATOR_PROMPT }];
        }
        if (extractConfig.promptParts.length === 0) {
            extractConfig.promptParts = [{ type: 'text', text: DEFAULT_EXTRACT_DATA }];
        }
        if (mergeConfig.promptParts.length === 0) {
            mergeConfig.promptParts = [{ type: 'text', text: DEFAULT_MERGE_DATA }];
        }

        return {
            url,
            schema,
            budget: config.budget,
            batchSize: config.batchSize,
            navigatorConfig,
            extractConfig,
            mergeConfig
        };
    }

    async execute(context: PluginContext): Promise<PluginResult> {
        const { row, stepIndex, config, services } = context;
        const resolvedConfig = config as WebsiteAgentResolvedConfig;

        if (!services.aiWebsiteAgent) {
            throw new Error("AiWebsiteAgent service is not available.");
        }

        // Throw error if URL is empty so the row is skipped by ActionRunner
        if (!resolvedConfig.url || resolvedConfig.url.trim() === '') {
            throw new Error(`[WebsiteAgent] Step ${stepIndex}: No URL provided.`);
        }

        // Validate URL with Regex
        const urlRegex = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
        if (!urlRegex.test(resolvedConfig.url)) {
            throw new Error(`[WebsiteAgent] Step ${stepIndex}: Invalid URL format (must start with http/https): "${resolvedConfig.url}"`);
        }

        const result = await services.aiWebsiteAgent.scrapeIterative(
            resolvedConfig.url,
            resolvedConfig.schema,
            {
                budget: resolvedConfig.budget,
                batchSize: resolvedConfig.batchSize,
                navigatorConfig: resolvedConfig.navigatorConfig,
                extractConfig: resolvedConfig.extractConfig,
                mergeConfig: resolvedConfig.mergeConfig,
                row: row // Pass row for template rendering in AiWebsiteAgent
            }
        );

        return {
            contentParts: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
            }],
            data: [result] // Wrap in array to signify 1:1 mapping
        };
    }
}
