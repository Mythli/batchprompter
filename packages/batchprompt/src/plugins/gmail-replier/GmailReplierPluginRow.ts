import { z } from 'zod';
import { format } from 'date-fns';
import { BasePluginRow, PluginResult, PluginItem } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { GmailReplierConfig } from './GmailReplierPlugin.js';
import { EmailContextBuilder } from './EmailContextBuilder.js';
import { InteractiveReviewer } from './InteractiveReviewer.js';
import { DEFAULT_SYSTEM_PROMPT } from './defaultPrompts.js';
import { GmailClient, EmailMetadata } from 'gmail-puppet';

interface DraftTask {
    target: EmailMetadata;
    targetContext: string;
    draftPromise: Promise<{ draft: string, skip: boolean, reason?: string }>;
    isResolved: boolean;
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

        const bufferSize = config.bufferSize;
        const tasks: DraftTask[] = [];
        let targetIndex = 0;

        const startNextTask = () => {
            if (targetIndex >= targetEmails.length) return;
            
            const target = targetEmails[targetIndex++];
            const task: DraftTask = {
                target,
                targetContext: '',
                isResolved: false,
                draftPromise: null as any
            };

            task.draftPromise = (async () => {
                const targetContext = await contextBuilder.buildTargetContext(target);
                task.targetContext = targetContext;
                
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
                        task.isResolved = true;
                        return { draft: '', skip: true, reason: decision.reason };
                    }
                }

                const llm = await stepRow.createLlm(config.draftModel);
                const currentDateStr = format(new Date(), "EEEE, yyyy-MM-dd HH:mm");
                const promptParts = [
                    { type: 'text' as const, text: DEFAULT_SYSTEM_PROMPT },
                    { type: 'text' as const, text: `\n\n--- CURRENT DATE & TIME ---\nToday is ${currentDateStr}. Use this to understand relative time references (like "tomorrow", "next week") in the thread.` },
                    { type: 'text' as const, text: `\n\n--- INSPIRATION EXAMPLES ---\n${inspirationContext}` },
                    { type: 'text' as const, text: `\n\n--- CURRENT THREAD ---\n${targetContext}` }
                ];
                const draft = await llm.promptText({ prefix: promptParts });
                task.isResolved = true;
                return { draft, skip: false };
            })();

            // Prevent unhandled rejection crash. We will await draftPromise later and catch it there.
            task.draftPromise.catch(() => {});

            tasks.push(task);
        };

        // Initial fill of the buffer
        for (let i = 0; i < bufferSize; i++) {
            startNextTask();
        }

        while (tasks.length > 0) {
            const currentTask = tasks.shift()!;
            
            // Start a new task to replace the one we just took out of the buffer
            startNextTask();
            
            const target = currentTask.target;
            events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'process:target', data: { subject: target.subject } });
            
            let action: 'send' | 'ignore' | 'regenerate' | 'change_ai' | 'quit' = 'regenerate';
            let finalDraft = '';
            let isFirstAttempt = true;
            let aiInstruction = '';

            while (action === 'regenerate' || action === 'change_ai') {
                if (isFirstAttempt) {
                    // Only emit the "generating" event if we actually have to wait for it.
                    // This prevents console logs from messing up the interactive UI.
                    if (!currentTask.isResolved) {
                        events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'draft:generating', data: { subject: target.subject } });
                    }
                    const result = await currentTask.draftPromise;
                    isFirstAttempt = false;

                    if (result.skip) {
                        events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'email:skipped', data: { subject: target.subject, reason: result.reason } });
                        action = 'ignore';
                        finalDraft = '';
                        break;
                    }
                    finalDraft = result.draft;
                } else {
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
