import { Command } from 'commander';
import OpenAI from 'openai';
import Handlebars from 'handlebars';
import { ContentProviderPlugin, PluginContext, PluginResult, NormalizedPluginConfig } from '../types.js';
import { PromptResolver } from '../../utils/PromptResolver.js';

// Default Prompts
const DEFAULT_EXTRACT_LINKS = `You are a web scraper assistant. Your task is to identify the most relevant URLs for scraping additional company information (like About Us, Contact, Imprint, Team, Products) from the provided list of links found on the website {{baseUrl}}.

Base URL: {{baseUrl}}

List of links:
{{linksText}}`;

const DEFAULT_EXTRACT_DATA = `You are given the website content of {{url}} (converted to markdown). Your primary goal is to extract information from this content to accurately populate the provided JSON schema.

Website content:
{{truncatedMarkdown}}`;

const DEFAULT_MERGE_DATA = `You are a data consolidation expert. Merge the following JSON objects extracted from different pages of the same website into a single comprehensive object adhering to the schema.

Objects:
{{jsonObjects}}`;

interface WebsiteAgentRawConfig {
    url?: string;
    schemaPath?: string;
    depth: number;
    extractLinksPrompt?: string;
    extractDataPrompt?: string;
    mergeDataPrompt?: string;
}

interface WebsiteAgentResolvedConfig {
    url: string;
    schema: any; // JSON Schema object
    depth: number;
    extractLinksPrompt: string;
    extractDataPrompt: string;
    mergeDataPrompt: string;
}

export class WebsiteAgentPlugin implements ContentProviderPlugin {
    name = 'website-agent';

    constructor() {}

    register(program: Command): void {
        program.option('--website-agent-url <url>', 'Starting URL for the agent');
        program.option('--website-agent-schema <path>', 'Path to JSON schema for extraction');
        program.option('--website-agent-depth <number>', 'Depth of navigation (0=single page, 1=subpages)', '0');
        program.option('--website-agent-export', 'Export agent data to output row', false);
        
        // Prompt Overrides
        program.option('--website-agent-extract-links-prompt <prompt>', 'Prompt for link extraction (file or text)');
        program.option('--website-agent-extract-data-prompt <prompt>', 'Prompt for data extraction (file or text)');
        program.option('--website-agent-merge-data-prompt <prompt>', 'Prompt for data merging (file or text)');
    }

    registerStep(program: Command, stepIndex: number): void {
        program.option(`--website-agent-url-${stepIndex} <url>`, `Starting URL for step ${stepIndex}`);
        program.option(`--website-agent-schema-${stepIndex} <path>`, `Schema path for step ${stepIndex}`);
        program.option(`--website-agent-depth-${stepIndex} <number>`, `Depth for step ${stepIndex}`);
        program.option(`--website-agent-export-${stepIndex}`, `Export agent data to output row for step ${stepIndex}`);

        program.option(`--website-agent-extract-links-prompt-${stepIndex} <prompt>`, `Link extraction prompt for step ${stepIndex}`);
        program.option(`--website-agent-extract-data-prompt-${stepIndex} <prompt>`, `Data extraction prompt for step ${stepIndex}`);
        program.option(`--website-agent-merge-data-prompt-${stepIndex} <prompt>`, `Data merging prompt for step ${stepIndex}`);
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

        const config: WebsiteAgentRawConfig = {
            url,
            schemaPath,
            depth: parseInt(getOpt('websiteAgentDepth') || '0', 10),
            extractLinksPrompt: getOpt('websiteAgentExtractLinksPrompt'),
            extractDataPrompt: getOpt('websiteAgentExtractDataPrompt'),
            mergeDataPrompt: getOpt('websiteAgentMergeDataPrompt')
        };

        return {
            config,
            exportData: !!getOpt('websiteAgentExport')
        };
    }

    async prepare(config: WebsiteAgentRawConfig, row: Record<string, any>): Promise<WebsiteAgentResolvedConfig> {
        const urlTemplate = config.url || '';
        const url = Handlebars.compile(urlTemplate, { noEscape: true })(row);

        let schema: any;
        if (config.schemaPath) {
            // Resolve schema path (supports dynamic paths)
            const parts = await PromptResolver.resolve(config.schemaPath, row);
            if (parts.length > 0 && parts[0].type === 'text') {
                try {
                    schema = JSON.parse(parts[0].text);
                } catch (e) {
                    throw new Error(`Failed to parse JSON schema from ${config.schemaPath}`);
                }
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

        return {
            url,
            schema,
            depth: config.depth,
            extractLinksPrompt: config.extractLinksPrompt || DEFAULT_EXTRACT_LINKS,
            extractDataPrompt: config.extractDataPrompt || DEFAULT_EXTRACT_DATA,
            mergeDataPrompt: config.mergeDataPrompt || DEFAULT_MERGE_DATA
        };
    }

    async execute(context: PluginContext): Promise<PluginResult> {
        const { row, stepIndex, config, services } = context;
        const resolvedConfig = config as WebsiteAgentResolvedConfig;

        if (!services.aiWebsiteAgent) {
            throw new Error("AiWebsiteAgent service is not available.");
        }

        // Gracefully handle empty URLs (e.g. if upstream search failed)
        if (!resolvedConfig.url || resolvedConfig.url.trim() === '') {
            console.log(`[WebsiteAgent] Step ${stepIndex}: No URL provided (or empty). Skipping.`);
            return { contentParts: [], data: null };
        }

        const result = await services.aiWebsiteAgent.scrape(
            resolvedConfig.url,
            resolvedConfig.schema,
            { 
                depth: resolvedConfig.depth,
                extractLinksPrompt: resolvedConfig.extractLinksPrompt,
                extractDataPrompt: resolvedConfig.extractDataPrompt,
                mergeDataPrompt: resolvedConfig.mergeDataPrompt
            }
        );

        return {
            contentParts: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
            }],
            data: result
        };
    }
}
