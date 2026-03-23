import OpenAI from 'openai';
import { z } from 'zod';
import Handlebars from 'handlebars';
import { BasePlugin, BasePluginRow } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { PartialOutputConfigSchema, StepConfig, GlobalConfig } from '../../config/schema.js';
import { ModelConfigSchema, ModelConfig } from '../../config/model.js';
import { GmailClient } from 'gmail-puppet';
import { GmailReplierPluginRow } from './GmailReplierPluginRow.js';

export const GmailReplierConfigSchema = z.object({
    type: z.literal('gmailReplier'),
    targetQuery: z.string().default('is:unread'),
    limit: z.number().int().positive().default(100),
    inspirationQuery: z.string().default('subject:(re OR aw) from:me'),
    inspirationLimit: z.number().int().positive().default(10),
    draftModel: ModelConfigSchema.optional(),
    evaluateReply: z.boolean().default(false),
    evaluateModel: ModelConfigSchema.optional(),
    interactive: z.boolean().default(true),
    autoSend: z.boolean().default(false),
    output: PartialOutputConfigSchema.optional()
});

export type GmailReplierConfig = z.output<typeof GmailReplierConfigSchema>;

function fillModelDefaults(
    pluginModel: ModelConfig | undefined,
    globalModel: ModelConfig | undefined
): ModelConfig | undefined {
    const base: ModelConfig = pluginModel || { messages: [] } as ModelConfig;
    return {
        ...base,
        model: base.model || globalModel?.model,
        temperature: base.temperature ?? globalModel?.temperature,
        reasoning_effort: base.reasoning_effort ?? globalModel?.reasoning_effort,
    };
}

function hydrateModelMessages(
    model: ModelConfig | undefined,
    context: Record<string, any>
): ModelConfig | undefined {
    if (!model) return undefined;

    return {
        ...model,
        messages: model.messages.map(msg => {
            if (typeof msg.content === 'string') {
                const compiled = Handlebars.compile(msg.content, { noEscape: true });
                return { ...msg, content: compiled(context) };
            }
            if (Array.isArray(msg.content)) {
                const hydratedContent = msg.content.map((part: any) => {
                    if (part.type === 'text') {
                        const compiled = Handlebars.compile(part.text, { noEscape: true });
                        return { ...part, text: compiled(context) };
                    }
                    return part;
                });
                return { ...msg, content: hydratedContent };
            }
            return msg;
        }) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    };
}

export class GmailReplierPlugin extends BasePlugin<GmailReplierConfig, GmailReplierConfig> {
    readonly type = 'gmailReplier';

    constructor(private deps: { gmailClient?: GmailClient }) {
        super();
    }

    getSchema() {
        return GmailReplierConfigSchema;
    }

    isInteractive(config: GmailReplierConfig): boolean {
        return config.interactive === true;
    }

    normalizeConfig(config: GmailReplierConfig, stepConfig: StepConfig, globalConfig: GlobalConfig): GmailReplierConfig {
        const base = super.normalizeConfig(config, stepConfig, globalConfig);
        
        let evaluateModel = config.evaluateModel;
        if (config.evaluateReply && !evaluateModel) {
            evaluateModel = { messages: [] } as ModelConfig;
        }

        return {
            ...base,
            draftModel: fillModelDefaults(config.draftModel, globalConfig.model),
            evaluateModel: fillModelDefaults(evaluateModel, globalConfig.model)
        };
    }

    async hydrate(_stepConfig: StepConfig, _globalConfig: GlobalConfig, config: GmailReplierConfig, context: Record<string, any>): Promise<GmailReplierConfig> {
        return {
            ...config,
            draftModel: hydrateModelMessages(config.draftModel, context),
            evaluateModel: hydrateModelMessages(config.evaluateModel, context),
        };
    }

    createRow(stepRow: StepRow, config: GmailReplierConfig): BasePluginRow<GmailReplierConfig> {
        if (!this.deps.gmailClient) {
            throw new Error("GmailReplierPlugin requires a configured GmailClient (GMAIL_EMAIL and GMAIL_PASSWORD).");
        }
        return new GmailReplierPluginRow(stepRow, config, this.deps.gmailClient);
    }
}
