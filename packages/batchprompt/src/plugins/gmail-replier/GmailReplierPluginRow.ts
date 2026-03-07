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
    draftPromise: Promise<string>;
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
                
                const llm = await stepRow.createLlm(config.draftModel);
                const promptParts = [
                    { type: 'text' as const, text: DEFAULT_SYSTEM_PROMPT },
                    { type: 'text' as const, text: `\n\n--- INSPIRATION EXAMPLES ---\n${inspirationContext}` },
                    { type: 'text' as const, text: `\n\n--- CURRENT THREAD ---\n${targetContext}` }
                ];
                const draft = await llm.promptText({ prefix: promptParts });
                task.isResolved = true;
                return draft;
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
            
            let action: 'send' | 'ignore' | 'regenerate' | 'quit' = 'regenerate';
            let finalDraft = '';
            let isFirstAttempt = true;

            while (action === 'regenerate') {
                if (isFirstAttempt) {
                    // Only emit the "generating" event if we actually have to wait for it.
                    // This prevents console logs from messing up the interactive UI.
                    if (!currentTask.isResolved) {
                        events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'draft:generating', data: { subject: target.subject } });
                    }
                    finalDraft = await currentTask.draftPromise;
                    isFirstAttempt = false;
                } else {
                    events.emit('plugin:event', { row: rowIndex, step: stepIndex, plugin: 'gmailReplier', event: 'draft:generating', data: { subject: target.subject } });
                    const llm = await stepRow.createLlm(config.draftModel);
                    const promptParts = [
                        { type: 'text' as const, text: DEFAULT_SYSTEM_PROMPT },
                        { type: 'text' as const, text: `\n\n--- INSPIRATION EXAMPLES ---\n${inspirationContext}` },
                        { type: 'text' as const, text: `\n\n--- CURRENT THREAD ---\n${currentTask.targetContext}` }
                    ];
                    finalDraft = await llm.promptText({ prefix: promptParts });
                }

                if (config.interactive) {
                    const reviewResult = await InteractiveReviewer.review(target.subject, currentTask.targetContext, finalDraft);
                    action = reviewResult.action;
                    finalDraft = reviewResult.text;
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
