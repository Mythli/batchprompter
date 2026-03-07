import { BasePluginRow, PluginResult, PluginItem } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { GmailReplierConfig } from './GmailReplierPlugin.js';
import { EmailContextBuilder } from './EmailContextBuilder.js';
import { InteractiveReviewer } from './InteractiveReviewer.js';
import { DEFAULT_SYSTEM_PROMPT } from './defaultPrompts.js';
import { GmailClient } from 'gmail-puppet';

export class GmailReplierPluginRow extends BasePluginRow<GmailReplierConfig> {
    constructor(stepRow: StepRow, config: GmailReplierConfig, private gmailClient: GmailClient) {
        super(stepRow, config);
    }

    async prepare(): Promise<PluginResult> {
        const { config, stepRow } = this;
        const events = stepRow.getEvents();
        const rowIndex = stepRow.getOriginalIndex();
        const stepIndex = stepRow.step.stepIndex;

        events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'search:target', data: { query: config.targetQuery } });
        
        const targetEmails = await this.gmailClient.searchEmails(config.targetQuery, config.limit);
        
        if (targetEmails.length === 0) {
            events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'search:empty', data: {} });
            return { history: await stepRow.getPreparedMessages(), items: [] };
        }

        events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'search:inspiration', data: { query: config.inspirationQuery } });
        const inspirationEmails = await this.gmailClient.searchEmails(config.inspirationQuery, config.inspirationLimit);
        
        const contextBuilder = new EmailContextBuilder(this.gmailClient);
        const inspirationContext = await contextBuilder.buildInspirationContext(inspirationEmails);

        const items: PluginItem[] = [];

        for (const target of targetEmails) {
            events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'process:target', data: { subject: target.subject } });
            
            const targetContext = await contextBuilder.buildTargetContext(target);
            
            let action: 'send' | 'ignore' | 'regenerate' = 'regenerate';
            let finalDraft = '';

            while (action === 'regenerate') {
                events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'draft:generating', data: { subject: target.subject } });
                
                const llm = await stepRow.createLlm(config.draftModel);
                
                const promptParts = [
                    { type: 'text' as const, text: DEFAULT_SYSTEM_PROMPT },
                    { type: 'text' as const, text: `\n\n--- INSPIRATION EXAMPLES ---\n${inspirationContext}` },
                    { type: 'text' as const, text: `\n\n--- CURRENT THREAD ---\n${targetContext}` }
                ];

                finalDraft = await llm.promptText({ prefix: promptParts });

                if (config.interactive) {
                    const reviewResult = await InteractiveReviewer.review(target.subject, targetContext, finalDraft);
                    action = reviewResult.action;
                    finalDraft = reviewResult.text;
                } else {
                    action = config.autoSend ? 'send' : 'ignore';
                }
            }

            if (action === 'send') {
                events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'email:sending', data: { subject: target.subject } });
                await this.gmailClient.sendEmail({
                    replyToId: target.id,
                    htmlBody: finalDraft.replace(/\n/g, '<br>')
                });
                events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'email:sent', data: { subject: target.subject } });
            } else {
                events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'email:ignored', data: { subject: target.subject } });
            }

            items.push({
                data: {
                    id: target.id,
                    subject: target.subject,
                    sender: target.sender,
                    action,
                    draft: finalDraft
                },
                contentParts: []
            });
        }

        return {
            history: await stepRow.getPreparedMessages(),
            items
        };
    }
}
