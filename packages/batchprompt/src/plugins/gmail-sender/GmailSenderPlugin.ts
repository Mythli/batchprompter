import { z } from 'zod';
import Handlebars from 'handlebars';
import { marked } from 'marked';
import { BasePlugin, BasePluginRow, PluginResult } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { PartialOutputConfigSchema } from '../../config/schema.js';
import { zHandlebars } from '../../config/validationRules.js';
import { ensureAuthenticatedGmail, sendEmail } from 'gmail-puppet';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';

export const GmailSenderConfigSchema = z.object({
    type: z.literal('gmailSender'),
    to: zHandlebars.optional(),
    subject: zHandlebars.optional(),
    body: zHandlebars,
    replyToId: zHandlebars.optional(),
    delayMin: z.number().min(0).default(0),
    delayMax: z.number().min(0).default(0),
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

        events.emit('plugin:event', {
            row: rowIndex,
            step: stepIndex,
            plugin: 'gmailSender',
            event: 'send:started',
            data: { to, subject, replyToId }
        });

        const browser = await deps.puppeteerHelper.getBrowser();
        const page = await ensureAuthenticatedGmail(browser, {
            email: deps.email,
            password: deps.password
        });

        // 5. Sending the Email
        try {
            await sendEmail(page, {
                to,
                subject,
                htmlBody,
                replyToId
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
                replyToId,
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
            // 6. Cleanup
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
