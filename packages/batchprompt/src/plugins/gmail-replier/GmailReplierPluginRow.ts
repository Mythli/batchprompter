import { z } from 'zod';
import { format } from 'date-fns';
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
        
        // Use the parallel searchAndReadThreads function from gmail-puppet
        const inspirationThreads = await this.gmailClient.searchAndReadThreads(config.inspirationQuery, config.inspirationLimit);
        
        const contextBuilder = new EmailContextBuilder(this.gmailClient);
        const inspirationContext = await contextBuilder.buildInspirationContext(inspirationThreads);

        const items: PluginItem[] = [];

        for (const target of targetEmails) {
            events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'process:target', data: { subject: target.subject } });
            
            const targetContext = await contextBuilder.buildTargetContext(target);
            
            if (config.evaluateReply) {
                const evalLlm = await stepRow.createLlm(config.evaluateModel);
                const EvalSchema = z.object({
                    requiresReply: z.boolean().describe("True if the email requires a reply from us."),
                    reason: z.string().describe("Reasoning for the decision.")
                });
                const evalPrompt = "Read the following email thread and decide if it requires a reply. Ignore automated messages, newsletters, or conversations that have naturally concluded.";
                const decision = await evalLlm.promptZod({
                    suffix: [
                        { type: 'text', text: evalPrompt },
                        { type: 'text', text: `\n\n--- CURRENT THREAD ---\n${targetContext}` }
                    ]
                }, EvalSchema);

                if (!decision.requiresReply) {
                    events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'email:skipped', data: { subject: target.subject, reason: decision.reason } });
                    items.push({
                        data: {
                            id: target.id,
                            subject: target.subject,
                            sender: target.sender,
                            action: 'ignore',
                            draft: ''
                        },
                        contentParts: []
                    });
                    continue;
                }
            }

            let action: 'send' | 'ignore' | 'regenerate' | 'change_ai' | 'quit' = 'regenerate';
            let finalDraft = '';
            let aiInstruction = '';

            while (action === 'regenerate' || action === 'change_ai') {
                events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'draft:generating', data: { subject: target.subject } });
                
                const llm = await stepRow.createLlm(config.draftModel);
                const currentDateStr = format(new Date(), "EEEE, yyyy-MM-dd HH:mm");
                const promptParts: any[] = [
                    { type: 'text' as const, text: DEFAULT_SYSTEM_PROMPT },
                    { type: 'text' as const, text: `\n\n--- CURRENT DATE & TIME ---\nToday is ${currentDateStr}. Use this to understand relative time references (like "tomorrow", "next week") in the thread.` },
                    { type: 'text' as const, text: `\n\n--- INSPIRATION EXAMPLES ---\n${inspirationContext}` },
                    { type: 'text' as const, text: `\n\n--- CURRENT THREAD ---\n${targetContext}` }
                ];

                if (action === 'change_ai' && aiInstruction) {
                    promptParts.push({ type: 'text' as const, text: `\n\n--- PREVIOUS DRAFT ---\n${finalDraft}` });
                    promptParts.push({ type: 'text' as const, text: `\n\n--- USER INSTRUCTION ---\nPlease rewrite the previous draft according to this instruction: ${aiInstruction}` });
                }

                finalDraft = await llm.promptText({ prefix: promptParts });

                if (config.interactive) {
                    const reviewResult = await InteractiveReviewer.review(target.subject, targetContext, finalDraft);
                    action = reviewResult.action;
                    finalDraft = reviewResult.text;
                    aiInstruction = reviewResult.instruction || '';
                } else {
                    action = config.autoSend ? 'send' : 'ignore';
                }
            }

            if (action === 'quit') {
                events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'process:quit', data: {} });
                break;
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
