import { z } from 'zod';
import { format } from 'date-fns';
import { BasePluginRow, PluginResult, PluginItem } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { GmailReplierConfig } from './GmailReplierPlugin.js';
import { EmailContextBuilder } from './EmailContextBuilder.js';
import { InteractiveReviewer } from './InteractiveReviewer.js';
import { DEFAULT_SYSTEM_PROMPT } from './defaultPrompts.js';
import { GmailClient, EmailMetadata } from 'gmail-puppet';

interface PreparedDraft {
    target: EmailMetadata;
    targetContext: string;
    draft: string;
    skip: boolean;
    reason?: string;
}

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
        const pendingSends: Promise<void>[] = [];

        // Helper to prepare a draft in the background
        const prepareDraft = async (target: EmailMetadata): Promise<PreparedDraft> => {
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
                    return { target, targetContext, draft: '', skip: true, reason: decision.reason };
                }
            }

            const llm = await stepRow.createLlm(config.draftModel);
            const currentDateStr = format(new Date(), "EEEE, yyyy-MM-dd HH:mm");
            const promptParts: any[] = [
                { type: 'text' as const, text: DEFAULT_SYSTEM_PROMPT },
                { type: 'text' as const, text: `\n\n--- CURRENT DATE & TIME ---\nToday is ${currentDateStr}. Use this to understand relative time references (like "tomorrow", "next week") in the thread.` },
                { type: 'text' as const, text: `\n\n--- INSPIRATION EXAMPLES ---\n${inspirationContext}` },
                { type: 'text' as const, text: `\n\n--- CURRENT THREAD ---\n${targetContext}` }
            ];

            const draft = await llm.promptText({ prefix: promptParts });
            return { target, targetContext, draft, skip: false };
        };

        // Start the first task immediately
        let nextTaskPromise: Promise<PreparedDraft> | null = prepareDraft(targetEmails[0]);
        // Catch errors on the background promise so it doesn't crash the process unhandled
        nextTaskPromise.catch(() => {});

        for (let i = 0; i < targetEmails.length; i++) {
            // Wait for the current task to finish
            const currentTask = await nextTaskPromise!;
            const target = currentTask.target;

            // Immediately kick off the NEXT task in the background (if there is one)
            if (i + 1 < targetEmails.length) {
                nextTaskPromise = prepareDraft(targetEmails[i + 1]);
                nextTaskPromise.catch(() => {}); // Prevent unhandled rejections
            } else {
                nextTaskPromise = null;
            }

            events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'process:target', data: { subject: target.subject } });

            if (currentTask.skip) {
                events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'email:skipped', data: { subject: target.subject, reason: currentTask.reason } });
                items.push({
                    data: { id: target.id, subject: target.subject, sender: target.sender, action: 'ignore', draft: '' },
                    contentParts: []
                });
                continue;
            }

            let action: 'send' | 'ignore' | 'regenerate' | 'change_ai' | 'quit' = 'regenerate';
            let finalDraft = currentTask.draft;
            let aiInstruction = '';
            let isFirstReview = true;

            while (action === 'regenerate' || action === 'change_ai') {
                if (!isFirstReview) {
                    events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'draft:generating', data: { subject: target.subject } });
                    
                    const llm = await stepRow.createLlm(config.draftModel);
                    const currentDateStr = format(new Date(), "EEEE, yyyy-MM-dd HH:mm");
                    const promptParts: any[] = [
                        { type: 'text' as const, text: DEFAULT_SYSTEM_PROMPT },
                        { type: 'text' as const, text: `\n\n--- CURRENT DATE & TIME ---\nToday is ${currentDateStr}. Use this to understand relative time references (like "tomorrow", "next week") in the thread.` },
                        { type: 'text' as const, text: `\n\n--- INSPIRATION EXAMPLES ---\n${inspirationContext}` },
                        { type: 'text' as const, text: `\n\n--- CURRENT THREAD ---\n${currentTask.targetContext}` }
                    ];

                    if (action === 'change_ai' && aiInstruction) {
                        promptParts.push({ type: 'text' as const, text: `\n\n--- PREVIOUS DRAFT ---\n${finalDraft}` });
                        promptParts.push({ type: 'text' as const, text: `\n\n--- USER INSTRUCTION ---\nPlease rewrite the previous draft according to this instruction: ${aiInstruction}` });
                    }

                    finalDraft = await llm.promptText({ prefix: promptParts });
                }
                isFirstReview = false;

                if (config.interactive) {
                    const reviewResult = await InteractiveReviewer.review(target.subject, currentTask.targetContext, finalDraft);
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
                
                // Fire and forget the send operation (collect promise to await at the end)
                const sendPromise = this.gmailClient.sendEmail({
                    replyToId: target.id,
                    htmlBody: finalDraft.replace(/\n/g, '<br>')
                }).then(() => {
                    events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'email:sent', data: { subject: target.subject } });
                }).catch(err => {
                    events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'error', data: { message: `Failed to send email: ${err.message}` } });
                });
                
                pendingSends.push(sendPromise);
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

        // Wait for all background sends to complete before finishing the plugin
        if (pendingSends.length > 0) {
            events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'info', data: { message: `Waiting for ${pendingSends.length} background sends to complete...` } });
            await Promise.all(pendingSends);
        }

        return {
            history: await stepRow.getPreparedMessages(),
            items
        };
    }
}
