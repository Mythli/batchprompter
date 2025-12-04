import { Command } from 'commander';
import OpenAI from 'openai';
import Handlebars from 'handlebars';
import { ContentProviderPlugin, PluginContext, PluginResult, NormalizedPluginConfig } from '../types.js';
import { PromptResolver } from '../../utils/PromptResolver.js';

interface WebsiteAgentRawConfig {
    url?: string;
    schemaPath?: string;
    depth: number;
}

interface WebsiteAgentResolvedConfig {
    url: string;
    schema: any; // JSON Schema object
    depth: number;
}

export class WebsiteAgentPlugin implements ContentProviderPlugin {
    name = 'website-agent';

    constructor() {}

    register(program: Command): void {
        program.option('--website-agent-url <url>', 'Starting URL for the agent');
        program.option('--website-agent-schema <path>', 'Path to JSON schema for extraction');
        program.option('--website-agent-depth <number>', 'Depth of navigation (0=single page, 1=subpages)', '0');
        program.option('--website-agent-export', 'Export agent data to output row', false);
    }

    registerStep(program: Command, stepIndex: number): void {
        program.option(`--website-agent-url-${stepIndex} <url>`, `Starting URL for step ${stepIndex}`);
        program.option(`--website-agent-schema-${stepIndex} <path>`, `Schema path for step ${stepIndex}`);
        program.option(`--website-agent-depth-${stepIndex} <number>`, `Depth for step ${stepIndex}`);
        program.option(`--website-agent-export-${stepIndex}`, `Export agent data to output row for step ${stepIndex}`);
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
            depth: parseInt(getOpt('websiteAgentDepth') || '0', 10)
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
            depth: config.depth
        };
    }

    async execute(context: PluginContext): Promise<PluginResult> {
        const { row, stepIndex, config, services } = context;
        const resolvedConfig = config as WebsiteAgentResolvedConfig;

        if (!services.aiWebsiteAgent) {
            throw new Error("AiWebsiteAgent service is not available.");
        }

        const result = await services.aiWebsiteAgent.scrape(
            resolvedConfig.url,
            resolvedConfig.schema,
            { depth: resolvedConfig.depth }
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
