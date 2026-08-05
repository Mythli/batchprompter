import { Command } from 'commander';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class GmailSenderAdapter implements CliPluginAdapter {
    readonly pluginType = 'gmailSender';

    registerOptionsForStep(program: Command, stepIndex: number) {
        const s = stepIndex;
        program.option(`--${s}-gmail-to <template>`, `Recipient for step ${s}`);
        program.option(`--${s}-gmail-subject <template>`, `Subject for step ${s}`);
        program.option(`--${s}-gmail-body <template>`, `Body for step ${s}`);
        program.option(`--${s}-gmail-reply-to-id <template>`, `Reply ID for step ${s}`);
        program.option(`--${s}-gmail-delay-min <number>`, `Min delay for step ${s}`, parseFloat);
        program.option(`--${s}-gmail-delay-max <number>`, `Max delay for step ${s}`, parseFloat);
        program.option(`--${s}-gmail-send-if-received`, `Send if received for step ${s}`);
        program.option(`--${s}-gmail-skip-if-subject-match`, `Skip if subject match for step ${s}`);
        program.option(`--${s}-gmail-reply-to-last-thread`, `Reply to last thread for step ${s}`);
        program.option(`--${s}-gmail-require-existing-thread`, `Require existing thread for step ${s}`);
        program.option(`--${s}-gmail-evaluate-replies`, `Evaluate replies for step ${s}`);
        program.option(`--${s}-gmail-evaluation-model <model>`, `Evaluation model for step ${s}`);
        program.option(`--${s}-gmail-evaluation-prompt <text>`, `Evaluation prompt for step ${s}`);
        program.option(`--${s}-gmail-output-mode <mode>`, `Output mode for step ${s}`);
        program.option(`--${s}-gmail-output-column <column>`, `Output column for step ${s}`);
        program.option(`--${s}-gmail-output-explode`, `Explode results for step ${s}`);
    }

    parseOptions(options: Record<string, any>, stepIndex: number): Record<string, any> | null {
        const getOpt = (key: string) => {
            const stepKey = `${stepIndex}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
            return options[stepKey];
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

        if (getOpt('gmailSendIfReceived')) result.sendIfReceived = true;
        if (getOpt('gmailSkipIfSubjectMatch')) result.skipIfSubjectMatch = true;
        if (getOpt('gmailReplyToLastThread')) result.replyToLastThread = true;
        if (getOpt('gmailRequireExistingThread')) result.requireExistingThread = true;
        if (getOpt('gmailEvaluateReplies')) result.evaluateReplies = true;

        const evalModel = getOpt('gmailEvaluationModel');
        const evalPrompt = getOpt('gmailEvaluationPrompt');
        if (evalModel || evalPrompt) {
            result.evaluationModel = {};
            if (evalModel) result.evaluationModel.model = evalModel;
            if (evalPrompt) result.evaluationModel.prompt = evalPrompt;
        }

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
