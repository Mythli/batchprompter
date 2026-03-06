import OpenAI from 'openai';
import { z } from 'zod';
import Handlebars from 'handlebars';
import { marked } from 'marked';
import { BasePlugin, BasePluginRow, PluginResult } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { PartialOutputConfigSchema } from '../../config/schema.js';
import { zHandlebars } from '../../config/validationRules.js';
import type { StepConfig, GlobalConfig } from '../../config/schema.js';
import { ModelConfigSchema, ModelConfig } from '../../config/model.js';
import { GmailClient } from 'gmail-puppet';

export const GmailSenderConfigSchema = z.object({
    type: z.literal('gmailSender'),
    to: zHandlebars.optional(),
    subject: zHandlebars.optional(),
    body: zHandlebars,
    replyToId: zHandlebars.optional(),
    delayMin: z.number().min(0).default(0),
    delayMax: z.number().min(0).default(0),
    sendIfReceived: z.boolean().default(true),
    skipIfSubjectMatch: z.boolean().default(false),
    replyToLastThread: z.boolean().default(false),
    requireExistingThread: z.boolean().default(false),
    evaluateReplies: z.boolean().default(false),
    evaluationModel: ModelConfigSchema.optional(),
    output: PartialOutputConfigSchema.optional()
});

export type GmailSenderConfig = z.output<typeof GmailSenderConfigSchema>;

export interface GmailSenderPluginDeps {
    gmailClient?: GmailClient;
}

/**
 * Fills in missing model parameters (model name, temperature, reasoning_effort) from global defaults.
 */
function fillModelDefaults(
    pluginModel: ModelConfig | undefined,
    globalModel: ModelConfig | undefined
): ModelConfig | undefined {
    if (!pluginModel) return undefined;
    
    return {
        ...pluginModel,
        model: pluginModel.model || globalModel?.model,
        temperature: pluginModel.temperature ?? globalModel?.temperature,
        reasoning_effort: pluginModel.reasoning_effort ?? globalModel?.reasoning_effort,
    };
}

/**
 * Renders Handlebars templates inside a ModelConfig's messages.
 */
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

class GmailSenderPluginRow extends BasePluginRow<GmailSenderConfig> {
    constructor(stepRow: StepRow, config: GmailSenderConfig, private deps: GmailSenderPluginDeps) {
        super(stepRow, config);
    }

    async postProcess(): Promise<PluginResult> {
        const { stepRow, config, deps } = this;
        const row = stepRow.context;
        const events = stepRow.getEvents();
        const rowIndex = stepRow.getOriginalIndex();
        const stepIndex = stepRow.step.stepIndex;

        // 1. Templating
        const render = (template?: string) => {
            if (!template) return undefined;
            return Handlebars.compile(template, { noEscape: true })(row);
        };

        const to = render(config.to);
        const subject = render(config.subject);
        const bodyMarkdown = render(config.body);
        const replyToId = render(config.replyToId);

        if (!bodyMarkdown) {
            throw new Error("Gmail Sender: 'body' is required.");
        }

        if (!replyToId && (!to || !subject)) {
            throw new Error("Gmail Sender: 'to' and 'subject' are required if 'replyToId' is not provided.");
        }

        // 2. Markdown Conversion
        const htmlBody = await marked.parse(bodyMarkdown);

        // 3. Delay Execution
        if (config.delayMax > 0) {
            const minMs = config.delayMin * 60 * 1000;
            const maxMs = config.delayMax * 60 * 1000;
            const delayMs = Math.floor(Math.random() * (maxMs - minMs + 1) + minMs);

            events.emit('plugin:event', {
                row: rowIndex,
                step: stepIndex,
                plugin: 'gmailSender',
                event: 'delay:started',
                data: { delayMs, delayMinutes: delayMs / 60000 }
            });

            await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        // 4. Authentication & Browser Setup
        if (!deps.gmailClient) {
            throw new Error("Gmail Sender: GMAIL_EMAIL and GMAIL_PASSWORD environment variables are required to initialize the Gmail client.");
        }

        const gmailClient = deps.gmailClient;

        try {
            let finalReplyToId = replyToId;
            let skipSend = false;
            let skipReason = '';

            const extractEmail = (str: string) => {
                const match = str.match(/<([^>]+)>/);
                return match ? match[1].trim().toLowerCase() : str.trim().toLowerCase();
            };

            // 5. Thread Checks
            if (to) {
                const toEmail = extractEmail(to);

                // Check if we have ever received an email from them
                if (!config.sendIfReceived) {
                    events.emit('plugin:event', {
                        row: rowIndex,
                        step: stepIndex,
                        plugin: 'gmailSender',
                        event: 'search:started',
                        data: { query: `from:${toEmail}` }
                    });

                    const receivedResults = await gmailClient.searchEmails(`from:${toEmail}`);

                    if (receivedResults.length > 0) {
                        if (config.evaluateReplies) {
                            events.emit('plugin:event', {
                                row: rowIndex,
                                step: stepIndex,
                                plugin: 'gmailSender',
                                event: 'evaluate:started',
                                data: { threadId: receivedResults[0].id }
                            });

                            const threadMessages = await gmailClient.readThread(receivedResults[0].id);
                            const replyTexts = threadMessages.map(m => `From: ${m.senderEmail}\nDate: ${m.date}\nBody:\n${m.textBody}`).join('\n\n---\n\n');

                            const llm = await stepRow.createLlm(config.evaluationModel);
                            
                            const defaultPrompt = "You are an email assistant managing an automated outreach campaign. We are scheduled to send an automated follow-up email to a prospect, but we detected a previous reply from them. Read their reply below. If their reply is an automated message (e.g., Out of Office, vacation responder, bounce notification, or automated ticket receipt), it is safe to send the follow-up. If it is a genuine human reply (e.g., asking a question, saying 'not interested', or requesting a call), we must NOT send the automated follow-up so a human can handle it manually.";

                            const EvaluationSchema = z.object({
                                isAutoresponder: z.boolean().describe("True if the reply is an automated response (e.g., OOO, bounce)."),
                                shouldSendAutomatedEmail: z.boolean().describe("True if we should proceed with sending the automated follow-up."),
                                reason: z.string().describe("Explanation of why it was classified as such.")
                            });

                            const promptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
                                { type: 'text', text: defaultPrompt },
                                { type: 'text', text: `\n\nDrafted Email to Send:\nSubject: ${subject}\nBody:\n${bodyMarkdown}` },
                                { type: 'text', text: `\n\nReceived Email(s):\n${replyTexts}` }
                            ];

                            const decision = await llm.promptZod({ suffix: promptParts }, EvaluationSchema);

                            events.emit('plugin:event', {
                                row: rowIndex,
                                step: stepIndex,
                                plugin: 'gmailSender',
                                event: 'evaluate:finished',
                                data: decision
                            });

                            if (!decision.shouldSendAutomatedEmail) {
                                skipSend = true;
                                skipReason = `human_reply_detected: ${decision.reason}`;
                            }
                        } else {
                            skipSend = true;
                            skipReason = 'received_email';
                        }
                    }
                }

                // Check if we already sent an email with the exact subject
                if (!skipSend && config.skipIfSubjectMatch && subject) {
                    const safeSubject = subject.replace(/"/g, '\\"');
                    const subjectQuery = `to:${toEmail} subject:"${safeSubject}"`;
                    
                    events.emit('plugin:event', {
                        row: rowIndex,
                        step: stepIndex,
                        plugin: 'gmailSender',
                        event: 'search:started',
                        data: { query: subjectQuery }
                    });

                    const subjectResults = await gmailClient.searchEmails(subjectQuery);

                    if (subjectResults.length > 0) {
                        skipSend = true;
                        skipReason = 'subject_match';
                    }
                }

                // Check for existing threads to reply to
                if (!skipSend && (config.replyToLastThread || config.requireExistingThread)) {
                    events.emit('plugin:event', {
                        row: rowIndex,
                        step: stepIndex,
                        plugin: 'gmailSender',
                        event: 'search:started',
                        data: { query: `to:${toEmail}` }
                    });

                    const searchResults = await gmailClient.searchEmails(`to:${toEmail}`);

                    if (searchResults.length === 0) {
                        if (config.requireExistingThread) {
                            skipSend = true;
                            skipReason = 'no_existing_thread';
                        }
                    } else {
                        if (config.replyToLastThread) {
                            finalReplyToId = searchResults[0].id;
                        }
                    }
                }
            }

            if (skipSend) {
                events.emit('plugin:event', {
                    row: rowIndex,
                    step: stepIndex,
                    plugin: 'gmailSender',
                    event: 'send:skipped',
                    data: { to, reason: skipReason }
                });

                const status = {
                    status: 'skipped',
                    reason: skipReason,
                    to,
                    subject,
                    replyToId: finalReplyToId,
                    timestamp: new Date().toISOString()
                };

                return {
                    history: await stepRow.getPreparedMessages(),
                    items: [{ data: status, contentParts: [] }]
                };
            }

            events.emit('plugin:event', {
                row: rowIndex,
                step: stepIndex,
                plugin: 'gmailSender',
                event: 'send:started',
                data: { to, subject, replyToId: finalReplyToId }
            });

            // 6. Sending the Email
            await gmailClient.sendEmail({
                to,
                subject,
                htmlBody,
                replyToId: finalReplyToId
            });

            events.emit('plugin:event', {
                row: rowIndex,
                step: stepIndex,
                plugin: 'gmailSender',
                event: 'send:success',
                data: { to, subject }
            });

            // 7. Output Generation
            const status = {
                status: 'success',
                to,
                subject,
                replyToId: finalReplyToId,
                timestamp: new Date().toISOString()
            };

            return {
                history: await stepRow.getPreparedMessages(),
                items: [{ data: status, contentParts: [] }]
            };
        } catch (error: any) {
            events.emit('plugin:event', {
                row: rowIndex,
                step: stepIndex,
                plugin: 'gmailSender',
                event: 'send:error',
                data: { error: error.message }
            });
            throw error;
        }
    }
}

export class GmailSenderPlugin extends BasePlugin<GmailSenderConfig, GmailSenderConfig> {
    readonly type = 'gmailSender';

    constructor(private deps: GmailSenderPluginDeps) {
        super();
    }

    getSchema() {
        return GmailSenderConfigSchema;
    }

    normalizeConfig(config: GmailSenderConfig, stepConfig: StepConfig, globalConfig: GlobalConfig): GmailSenderConfig {
        const base = super.normalizeConfig(config, stepConfig, globalConfig);
        const globalModel = globalConfig.model;

        // If evaluateReplies is true, ensure we have an evaluationModel (fallback to global)
        let evaluationModel = config.evaluationModel;
        if (config.evaluateReplies && !evaluationModel) {
            evaluationModel = { messages: [] }; // Empty messages, will use default prompt
        }

        return {
            ...base,
            evaluationModel: fillModelDefaults(evaluationModel, globalModel),
        };
    }

    async hydrate(_stepConfig: StepConfig, _globalConfig: GlobalConfig, config: GmailSenderConfig, context: Record<string, any>): Promise<GmailSenderConfig> {
        return {
            ...config,
            evaluationModel: hydrateModelMessages(config.evaluationModel, context),
        };
    }

    createRow(stepRow: StepRow, config: GmailSenderConfig): BasePluginRow<GmailSenderConfig> {
        return new GmailSenderPluginRow(stepRow, config, this.deps);
    }
}
