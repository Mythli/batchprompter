import { Command } from 'commander';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class GmailSenderAdapter implements CliPluginAdapter {
    readonly pluginType = 'gmailSender';

    registerOptions(program: Command) {
        program.option('--gmail-to <template>', 'Recipient email address (Handlebars)');
        program.option('--gmail-subject <template>', 'Email subject (Handlebars)');
        program.option('--gmail-body <template>', 'Email body in Markdown (Handlebars)');
        program.option('--gmail-reply-to-id <template>', 'Thread ID to reply to (Handlebars)');
        program.option('--gmail-delay-min <number>', 'Minimum delay in minutes before sending', parseFloat);
        program.option('--gmail-delay-max <number>', 'Maximum delay in minutes before sending', parseFloat);
        program.option('--gmail-send-if-replied', 'Send even if the recipient has already replied');
        program.option('--gmail-reply-to-last-thread', 'Reply to the most recent thread with the recipient');
        program.option('--gmail-require-existing-thread', 'Only send if a previous thread with the recipient exists');
        program.option('--gmail-output-mode <mode>', 'Output mode: merge/column/ignore');
        program.option('--gmail-output-column <column>', 'Output column name');
        program.option('--gmail-output-explode', 'Explode results into multiple rows');
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const s = stepIndex;
        program.option(`--${s}-gmail-to <template>`, `Recipient for step ${s}`);
        program.option(`--${s}-gmail-subject <template>`, `Subject for step ${s}`);
        program.option(`--${s}-gmail-body <template>`, `Body for step ${s}`);
        program.option(`--${s}-gmail-reply-to-id <template>`, `Reply ID for step ${s}`);
        program.option(`--${s}-gmail-delay-min <number>`, `Min delay for step ${s}`, parseFloat);
        program.option(`--${s}-gmail-delay-max <number>`, `Max delay for step ${s}`, parseFloat);
        program.option(`--${s}-gmail-send-if-replied`, `Send if replied for step ${s}`);
        program.option(`--${s}-gmail-reply-to-last-thread`, `Reply to last thread for step ${s}`);
        program.option(`--${s}-gmail-require-existing-thread`, `Require existing thread for step ${s}`);
        program.option(`--${s}-gmail-output-mode <mode>`, `Output mode for step ${s}`);
        program.option(`--${s}-gmail-output-column <column>`, `Output column for step ${s}`);
        program.option(`--${s}-gmail-output-explode`, `Explode results for step ${s}`);
    }

    parseOptions(options: Record<string, any>, stepIndex: number): Record<string, any> | null {
        const getOpt = (key: string) => {
            const stepKey = `${stepIndex}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
            return options[stepKey] ?? options[key];
        };

        const body = getOpt('gmailBody');
        if (!body) return null;

        const result: Record<string, any> = { type: 'gmailSender', body };

        const to = getOpt('gmailTo');
        if (to) result.to = to;

        const subject = getOpt('gmailSubject');
        if (subject) result.subject = subject;

        const replyToId = getOpt('gmailReplyToId');
        if (replyToId) result.replyToId = replyToId;

        const delayMin = getOpt('gmailDelayMin');
        if (delayMin !== undefined) result.delayMin = delayMin;

        const delayMax = getOpt('gmailDelayMax');
        if (delayMax !== undefined) result.delayMax = delayMax;

        if (getOpt('gmailSendIfReplied')) result.sendIfReplied = true;
        if (getOpt('gmailReplyToLastThread')) result.replyToLastThread = true;
        if (getOpt('gmailRequireExistingThread')) result.requireExistingThread = true;

        const outputMode = getOpt('gmailOutputMode');
        const outputColumn = getOpt('gmailOutputColumn');
        const outputExplode = getOpt('gmailOutputExplode');
        if (outputMode || outputColumn || outputExplode) {
            result.output = {};
            if (outputMode) result.output.mode = outputMode;
            if (outputColumn) result.output.column = outputColumn;
            if (outputExplode) result.output.explode = true;
        }

        return result;
    }
}
