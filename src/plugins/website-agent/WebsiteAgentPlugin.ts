import { Command } from 'commander';
import Handlebars from 'handlebars';
import { ContentProviderPlugin, PluginContext, PluginResult, NormalizedPluginConfig } from '../types.js';
import { SchemaHelper } from '../../utils/SchemaHelper.js';
import { ModelFlags } from '../../cli/ModelFlags.js';
import { ModelDefinition, ResolvedModelConfig, ServiceCapabilities } from '../../types.js';
import { PluginHelpers } from '../../utils/PluginHelpers.js';
import { AiWebsiteAgent } from '../../utils/AiWebsiteAgent.js';

const DEFAULT_NAVIGATOR_PROMPT = `You are an autonomous web scraper. Your goal is to find information to populate the provided schema. Analyze the current findings and available links to decide which pages to visit next.`;

const DEFAULT_EXTRACT_PROMPT = `You are a data extraction expert. Extract information from the provided website content to populate the JSON schema accurately.`;

const DEFAULT_MERGE_PROMPT = `You are a data consolidation expert. Merge the following JSON objects extracted from different pages of the same website into a single comprehensive object adhering to the schema.`;

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
    schema: any;
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

    normalize(
        options: Record<string, any>, 
        stepIndex: number, 
        globalConfig: any,
        capabilities: ServiceCapabilities
    ): NormalizedPluginConfig | undefined {
        const getOpt = (key: string) => {
            const specific = options[`${key}${stepIndex}`];
            if (specific !== undefined) return specific;
            return options[key];
        };

        const url = getOpt('websiteAgentUrl');
        const schemaPath = getOpt('websiteAgentSchema');

        if (!url) return undefined;

        if (!capabilities.hasPuppeteer) {
            throw new Error(
                `Step ${stepIndex} Website Agent requires Puppeteer which is not available.`
            );
        }

        const modelFlags = new ModelFlags(globalConfig.model);
        const extractModel = (namespace: string, fallbackNamespace: string): ModelDefinition => {
            const config = modelFlags.extract(options, namespace, fallbackNamespace);
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

        return { config };
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

        const navigatorConfig = await PluginHelpers.resolveModelConfig(config.navigatorConfig, row);
        const extractConfig = await PluginHelpers.resolveModelConfig(config.extractConfig, row);
        const mergeConfig = await PluginHelpers.resolveModelConfig(config.mergeConfig, row);

        // Apply default prompts if none provided
        if (navigatorConfig.promptParts.length === 0) {
            navigatorConfig.promptParts = [{ type: 'text', text: DEFAULT_NAVIGATOR_PROMPT }];
        }
        if (extractConfig.promptParts.length === 0) {
            extractConfig.promptParts = [{ type: 'text', text: DEFAULT_EXTRACT_PROMPT }];
        }
        if (mergeConfig.promptParts.length === 0) {
            mergeConfig.promptParts = [{ type: 'text', text: DEFAULT_MERGE_PROMPT }];
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
        const { row, stepIndex, config, stepContext } = context;
        const resolvedConfig = config as WebsiteAgentResolvedConfig;

        if (!resolvedConfig.url || resolvedConfig.url.trim() === '') {
            throw new Error(`[WebsiteAgent] Step ${stepIndex}: No URL provided.`);
        }

        const urlRegex = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
        if (!urlRegex.test(resolvedConfig.url)) {
            throw new Error(`[WebsiteAgent] Step ${stepIndex}: Invalid URL format (must start with http/https): "${resolvedConfig.url}"`);
        }

        const navLlm = stepContext.createLlm(resolvedConfig.navigatorConfig);
        const extLlm = stepContext.createLlm(resolvedConfig.extractConfig);
        const mrgLlm = stepContext.createLlm(resolvedConfig.mergeConfig);

        const agent = new AiWebsiteAgent(
            navLlm,
            extLlm,
            mrgLlm,
            stepContext.global.puppeteerHelper,
            stepContext.global.puppeteerQueue
        );

        const result = await agent.scrapeIterative(
            resolvedConfig.url,
            resolvedConfig.schema,
            {
                budget: resolvedConfig.budget,
                batchSize: resolvedConfig.batchSize,
                row: row
            }
        );

        return {
            contentParts: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
            }],
            data: [result]
        };
    }
}
