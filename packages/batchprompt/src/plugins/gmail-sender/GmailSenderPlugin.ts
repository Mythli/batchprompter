import { z } from 'zod';
import Handlebars from 'handlebars';
import { marked } from 'marked';
import { BasePlugin, BasePluginRow, PluginResult } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { PartialOutputConfigSchema } from '../../config/schema.js';
import { zHandlebars } from '../../config/validationRules.js';
import type { StepConfig, GlobalConfig } from '../../config/schema.js';
import { ensureAuthenticatedGmail, sendEmail, searchEmails, readThread } from 'gmail-puppet';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';

export const GmailSenderConfigSchema = z.object({
    type: z.literal('gmailSender'),
    to: zHandlebars.optional(),
    subject: zHandlebars.optional(),
    body: zHandlebars,
    replyToId: zHandlebars.optional(),
    delayMin: z.number().min(0).default(0),
    delayMax: z.number().min(0).default(0),
    sendIfReplied: z.boolean().default(false),
    replyToLastThread: z.boolean().default(false),
    requireExistingThread: z.boolean().default(false),
    output: PartialOutputConfigSchema.optional()
});

export type GmailSenderConfig = z.output<typeof GmailSenderConfigSchema>;

export interface GmailSenderPluginDeps {
    puppeteerHelper: PuppeteerHelper;
    email?: string;
    password?: string;
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
        if (!deps.email || !deps.password) {
            throw new Error("Gmail Sender: GMAIL_EMAIL and GMAIL_PASSWORD environment variables are required.");
        }

        const browser = await deps.puppeteerHelper.getBrowser();
        const page = await ensureAuthenticatedGmail(browser, {
            email: deps.email,
            password: deps.password
        });

        try {
            let finalReplyToId = replyToId;
            let skipSend = false;
            let skipReason = '';

            // 5. Thread Checks
            if (to && (!config.sendIfReplied || config.replyToLastThread || config.requireExistingThread)) {
                events.emit('plugin:event', {
                    row: rowIndex,
                    step: stepIndex,
                    plugin: 'gmailSender',
                    event: 'search:started',
                    data: { query: `to:${to}` }
                });

                const searchResults = await searchEmails(page, `to:${to}`);

                if (searchResults.length === 0) {
                    if (config.requireExistingThread) {
                        skipSend = true;
                        skipReason = 'no_existing_thread';
                    }
                } else {
                    const lastThreadId = searchResults[0].id;

                    if (!config.sendIfReplied) {
                        const messages = await readThread(page, lastThreadId);
                        
                        const extractEmail = (str: string) => {
                            const match = str.match(/<([^>]+)>/);
                            return match ? match[1].trim().toLowerCase() : str.trim().toLowerCase();
                        };
                        const toEmail = extractEmail(to);
                        
                        const hasReply = messages.some(m => m.senderEmail.toLowerCase() === toEmail);
                        if (hasReply) {
                            skipSend = true;
                            skipReason = 'recipient_replied';
                        }
                    }

                    if (config.replyToLastThread && !skipSend) {
                        finalReplyToId = lastThreadId;
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
            await sendEmail(page, {
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
        } finally {
            // 8. Cleanup
            await page.close().catch(() => {});
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

    createRow(stepRow: StepRow, config: GmailSenderConfig): BasePluginRow<GmailSenderConfig> {
        return new GmailSenderPluginRow(stepRow, config, this.deps);
    }
}
