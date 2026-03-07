import { Command } from 'commander';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class GmailReplierAdapter implements CliPluginAdapter {
    readonly pluginType = 'gmailReplier';

    registerOptions(program: Command) {
        program.option('--gmail-replier-target-query <query>', 'Query for emails to reply to');
        program.option('--gmail-replier-limit <number>', 'Max emails to process', parseInt);
        program.option('--gmail-replier-inspiration-query <query>', 'Query for inspiration emails');
        program.option('--gmail-replier-inspiration-limit <number>', 'Max inspiration emails', parseInt);
        program.option('--gmail-replier-draft-model <model>', 'Model for drafting replies');
        program.option('--gmail-replier-draft-prompt <text>', 'Prompt for drafting replies');
        program.option('--gmail-replier-evaluate-reply', 'Evaluate if reply is needed (default: true)');
        program.option('--no-gmail-replier-evaluate-reply', 'Disable reply evaluation');
        program.option('--gmail-replier-evaluate-model <model>', 'Model for evaluation');
        program.option('--gmail-replier-evaluate-prompt <text>', 'Prompt for evaluation');
        program.option('--gmail-replier-interactive', 'Enable interactive review (default: true)');
        program.option('--no-gmail-replier-interactive', 'Disable interactive review');
        program.option('--gmail-replier-auto-send', 'Auto-send if interactive is false');
        program.option('--gmail-replier-output-mode <mode>', 'Output mode');
        program.option('--gmail-replier-output-column <column>', 'Output column');
        program.option('--gmail-replier-output-explode', 'Explode results');
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const s = stepIndex;
        program.option(`--${s}-gmail-replier-target-query <query>`, `Target query for step ${s}`);
        program.option(`--${s}-gmail-replier-limit <number>`, `Limit for step ${s}`, parseInt);
        program.option(`--${s}-gmail-replier-inspiration-query <query>`, `Inspiration query for step ${s}`);
        program.option(`--${s}-gmail-replier-inspiration-limit <number>`, `Inspiration limit for step ${s}`, parseInt);
        program.option(`--${s}-gmail-replier-draft-model <model>`, `Draft model for step ${s}`);
        program.option(`--${s}-gmail-replier-draft-prompt <text>`, `Draft prompt for step ${s}`);
        program.option(`--${s}-gmail-replier-evaluate-reply`, `Evaluate reply for step ${s}`);
        program.option(`--no-${s}-gmail-replier-evaluate-reply`, `Disable reply evaluation for step ${s}`);
        program.option(`--${s}-gmail-replier-evaluate-model <model>`, `Evaluate model for step ${s}`);
        program.option(`--${s}-gmail-replier-evaluate-prompt <text>`, `Evaluate prompt for step ${s}`);
        program.option(`--${s}-gmail-replier-interactive`, `Interactive for step ${s}`);
        program.option(`--no-${s}-gmail-replier-interactive`, `No interactive for step ${s}`);
        program.option(`--${s}-gmail-replier-auto-send`, `Auto send for step ${s}`);
        program.option(`--${s}-gmail-replier-output-mode <mode>`, `Output mode for step ${s}`);
        program.option(`--${s}-gmail-replier-output-column <column>`, `Output column for step ${s}`);
        program.option(`--${s}-gmail-replier-output-explode`, `Explode results for step ${s}`);
    }

    parseOptions(options: Record<string, any>, stepIndex: number): Record<string, any> | null {
        const getOpt = (key: string) => {
            const stepKey = `${stepIndex}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
            return options[stepKey] ?? options[key];
        };

        const targetQuery = getOpt('gmailReplierTargetQuery');
        if (!targetQuery && getOpt('gmailReplierLimit') === undefined && getOpt('gmailReplierInteractive') === undefined) return null;

        const result: Record<string, any> = { type: 'gmailReplier' };

        if (targetQuery) result.targetQuery = targetQuery;
        if (getOpt('gmailReplierLimit') !== undefined) result.limit = getOpt('gmailReplierLimit');
        if (getOpt('gmailReplierInspirationQuery')) result.inspirationQuery = getOpt('gmailReplierInspirationQuery');
        if (getOpt('gmailReplierInspirationLimit') !== undefined) result.inspirationLimit = getOpt('gmailReplierInspirationLimit');
        
        if (getOpt('gmailReplierInteractive') !== undefined) result.interactive = getOpt('gmailReplierInteractive');
        if (getOpt('gmailReplierAutoSend') !== undefined) result.autoSend = getOpt('gmailReplierAutoSend');
        if (getOpt('gmailReplierEvaluateReply') !== undefined) result.evaluateReply = getOpt('gmailReplierEvaluateReply');

        const dModel = getOpt('gmailReplierDraftModel');
        const dPrompt = getOpt('gmailReplierDraftPrompt');
        if (dModel || dPrompt) {
            result.draftModel = {};
            if (dModel) result.draftModel.model = dModel;
            if (dPrompt) result.draftModel.prompt = dPrompt;
        }

        const eModel = getOpt('gmailReplierEvaluateModel');
        const ePrompt = getOpt('gmailReplierEvaluatePrompt');
        if (eModel || ePrompt) {
            result.evaluateModel = {};
            if (eModel) result.evaluateModel.model = eModel;
            if (ePrompt) result.evaluateModel.prompt = ePrompt;
        }

        const outputMode = getOpt('gmailReplierOutputMode');
        const outputColumn = getOpt('gmailReplierOutputColumn');
        const outputExplode = getOpt('gmailReplierOutputExplode');
        if (outputMode || outputColumn || outputExplode) {
            result.output = {};
            if (outputMode) result.output.mode = outputMode;
            if (outputColumn) result.output.column = outputColumn;
            if (outputExplode) result.output.explode = true;
        }

        return result;
    }
}
