import { describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { GmailSenderPlugin } from '../../src/plugins/gmail-sender/GmailSenderPlugin.js';
import { createPipelineSchema } from '../../src/config/index.js';
import { setupTestEnvironment } from '../utils/testUtils.js';

function setupGmailSenderTest() {
    const gmailClient = {
        sendEmail: vi.fn(async (_options: any) => {}),
        searchEmails: vi.fn(async (): Promise<any[]> => []),
        readThread: vi.fn(async (): Promise<any[]> => [])
    };

    const { executor, events, registry } = setupTestEnvironment({
        plugins: [new GmailSenderPlugin({
            gmailClient: gmailClient as any,
            senderEmail: 'tobias@example.com'
        })]
    });

    return { executor, events, registry, gmailClient };
}

function sentEmail(gmailClient: ReturnType<typeof setupGmailSenderTest>['gmailClient'], index = 0) {
    return gmailClient.sendEmail.mock.calls[index]?.[0] as any;
}

describe('GmailSenderPlugin variants', () => {
    it('keeps current single email behavior without variants', async () => {
        const { executor, gmailClient } = setupGmailSenderTest();

        const { results } = await executor.runConfig({
            taskConcurrency: 1,
            steps: [{
                plugins: [{
                    type: 'gmailSender',
                    to: '{{to}}',
                    subject: 'Subject {{id}}',
                    body: 'Body {{id}}',
                    output: { mode: 'merge' }
                }]
            }]
        }, [{ id: 1, to: 'lead@example.com' }]);

        expect(gmailClient.sendEmail).toHaveBeenCalledTimes(1);
        expect(gmailClient.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            to: 'lead@example.com',
            subject: 'Subject 1'
        }));
        expect(sentEmail(gmailClient).htmlBody).toContain('Body 1');
        expect(results[0].gmailSender.emailVariant).toBeUndefined();
    });

    it('cycles variants by original row order by default', async () => {
        const { executor, gmailClient } = setupGmailSenderTest();

        const { results } = await executor.runConfig({
            taskConcurrency: 1,
            steps: [{
                plugins: [{
                    type: 'gmailSender',
                    to: 'lead-{{id}}@example.com',
                    subject: [
                        { key: 'A', subject: 'Subject {{emailVariant.key}}' },
                        { key: 'B', subject: 'Subject {{emailVariant.key}}' },
                        { key: 'C', subject: 'Subject {{emailVariant.key}}' }
                    ],
                    body: [
                        { key: 'A', body: 'Body {{emailVariant.key}}/{{emailVariant.index}}' },
                        { key: 'B', body: 'Body {{emailVariant.key}}/{{emailVariant.index}}' },
                        { key: 'C', body: 'Body {{emailVariant.key}}/{{emailVariant.index}}' }
                    ],
                    output: { mode: 'merge' }
                }]
            }]
        }, [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);

        expect(gmailClient.sendEmail.mock.calls.map(call => (call[0] as any).subject)).toEqual([
            'Subject A',
            'Subject B',
            'Subject C',
            'Subject A'
        ]);
        expect(sentEmail(gmailClient, 1).htmlBody).toContain('Body B/1');
        expect(results.map(result => result.gmailSender.emailVariant?.key)).toEqual(['A', 'B', 'C', 'A']);
    });

    it('selects an explicit variant by rendered key', async () => {
        const { executor, gmailClient } = setupGmailSenderTest();

        const { results } = await executor.runConfig({
            taskConcurrency: 1,
            steps: [{
                plugins: [{
                    type: 'gmailSender',
                    to: 'lead@example.com',
                    variant: '{{emailVariantColumn}}',
                    subject: [
                        { key: 'A', subject: 'Subject A' },
                        { key: 'B', subject: 'Subject {{emailVariant.key}}' }
                    ],
                    body: [
                        { key: 'A', body: 'Body A' },
                        { key: 'B', body: 'Body {{emailVariant.index}}' }
                    ],
                    output: { mode: 'merge' }
                }]
            }]
        }, [{ emailVariantColumn: 'B' }]);

        expect(gmailClient.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            subject: 'Subject B'
        }));
        expect(sentEmail(gmailClient).htmlBody).toContain('Body 1');
        expect(results[0].gmailSender.emailVariant).toEqual(expect.objectContaining({ key: 'B', index: 1 }));
    });

    it('selects an explicit variant by rendered numeric index', async () => {
        const { executor, gmailClient } = setupGmailSenderTest();

        const { results } = await executor.runConfig({
            taskConcurrency: 1,
            steps: [{
                plugins: [{
                    type: 'gmailSender',
                    to: 'lead@example.com',
                    variant: '{{variantIndex}}',
                    subject: [
                        { key: 'A', subject: 'Subject A' },
                        { key: 'B', subject: 'Subject B' }
                    ],
                    body: [
                        { key: 'A', body: 'Body A' },
                        { key: 'B', body: 'Body B' }
                    ],
                    output: { mode: 'merge' }
                }]
            }]
        }, [{ variantIndex: '1' }]);

        expect(gmailClient.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            subject: 'Subject B'
        }));
        expect(results[0].gmailSender.emailVariant).toEqual(expect.objectContaining({ key: 'B', index: 1 }));
    });

    it('supports subject-only variants with a shared body', async () => {
        const { executor, gmailClient } = setupGmailSenderTest();

        const { results } = await executor.runConfig({
            taskConcurrency: 1,
            steps: [{
                plugins: [{
                    type: 'gmailSender',
                    to: 'lead@example.com',
                    subject: [
                        { key: 'A', subject: 'Subject {{emailVariant.key}}/{{emailVariant.index}}' }
                    ],
                    body: 'Shared body {{emailVariant.key}}',
                    output: { mode: 'merge' }
                }]
            }]
        }, [{}]);

        expect(gmailClient.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            subject: 'Subject A/0'
        }));
        expect(sentEmail(gmailClient).htmlBody).toContain('Shared body A');
        expect(results[0].gmailSender.emailVariant).toEqual(expect.objectContaining({ key: 'A', index: 0 }));
    });

    it('supports body-only variants with a shared subject', async () => {
        const { executor, gmailClient } = setupGmailSenderTest();

        const { results } = await executor.runConfig({
            taskConcurrency: 1,
            steps: [{
                plugins: [{
                    type: 'gmailSender',
                    to: 'lead@example.com',
                    subject: 'Shared subject {{emailVariant.key}}',
                    body: [
                        { key: 'A', body: 'Body {{emailVariant.index}}' }
                    ],
                    output: { mode: 'merge' }
                }]
            }]
        }, [{}]);

        expect(gmailClient.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            subject: 'Shared subject A'
        }));
        expect(sentEmail(gmailClient).htmlBody).toContain('Body 0');
        expect(results[0].gmailSender.emailVariant).toEqual(expect.objectContaining({ key: 'A', index: 0 }));
    });

    it('emits selected variant metadata on send events', async () => {
        const { executor, events } = setupGmailSenderTest();
        const sendEvents: any[] = [];
        events.on('plugin:event', event => {
            if (event.plugin === 'gmailSender' && event.event.startsWith('send:')) {
                sendEvents.push(event);
            }
        });

        await executor.runConfig({
            taskConcurrency: 1,
            steps: [{
                plugins: [{
                    type: 'gmailSender',
                    to: 'lead@example.com',
                    subject: 'Subject',
                    body: [{ key: 'A', body: 'Body' }],
                    output: { mode: 'merge' }
                }]
            }]
        }, [{}]);

        expect(sendEvents.find(event => event.event === 'send:started')?.data.emailVariant).toEqual(expect.objectContaining({ key: 'A', index: 0 }));
        expect(sendEvents.find(event => event.event === 'send:success')?.data.emailVariant).toEqual(expect.objectContaining({ key: 'A', index: 0 }));
    });

    it('fails before sending when an explicit variant key is invalid', async () => {
        const { executor, events, gmailClient } = setupGmailSenderTest();
        const errors: Error[] = [];
        events.on('row:error', event => errors.push(event.error));

        const { results } = await executor.runConfig({
            taskConcurrency: 1,
            steps: [{
                plugins: [{
                    type: 'gmailSender',
                    to: 'lead@example.com',
                    subject: 'Subject',
                    variant: '{{emailVariantColumn}}',
                    body: [{ key: 'A', body: 'Body A' }, { key: 'B', body: 'Body B' }],
                    output: { mode: 'merge' }
                }]
            }]
        }, [{ emailVariantColumn: 'Z' }]);

        expect(gmailClient.sendEmail).not.toHaveBeenCalled();
        expect(results).toEqual([]);
        expect(errors[0].message).toContain("body variant 'Z' was not found");
    });

    it('rejects the old variants field', async () => {
        const { executor, events } = setupGmailSenderTest();
        const errors: Error[] = [];
        events.on('row:error', event => errors.push(event.error));

        await expect(executor.runConfig({
            taskConcurrency: 1,
            steps: [{
                plugins: [{
                    type: 'gmailSender',
                    to: 'lead@example.com',
                    subject: 'Subject',
                    body: [{ key: 'A', body: 'Body A' }],
                    variants: [{ key: 'B', body: 'Body B' }]
                }]
            }]
        }, [{}])).rejects.toThrow();
    });

    it('cycles subject and body arrays independently', async () => {
        const { executor, gmailClient } = setupGmailSenderTest();

        const { results } = await executor.runConfig({
            taskConcurrency: 1,
            steps: [{
                plugins: [{
                    type: 'gmailSender',
                    to: 'lead-{{id}}@example.com',
                    subject: [
                        { key: 'A', subject: 'Subject {{emailVariant.key}}' },
                        { key: 'B', subject: 'Subject {{emailVariant.key}}' }
                    ],
                    body: [
                        { key: 'A', body: 'Body {{emailVariant.key}}/{{emailVariant.index}}' },
                        { key: 'B', body: 'Body {{emailVariant.key}}/{{emailVariant.index}}' },
                        { key: 'C', body: 'Body {{emailVariant.key}}/{{emailVariant.index}}' }
                    ],
                    output: { mode: 'merge' }
                }]
            }]
        }, [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }]);

        expect(gmailClient.sendEmail.mock.calls.map(call => (call[0] as any).subject)).toEqual([
            'Subject A',
            'Subject B',
            'Subject A',
            'Subject B',
            'Subject A',
            'Subject B'
        ]);
        expect(gmailClient.sendEmail.mock.calls.map(call => (call[0] as any).htmlBody)).toEqual([
            expect.stringContaining('Body A/0'),
            expect.stringContaining('Body B/1'),
            expect.stringContaining('Body C/2'),
            expect.stringContaining('Body A/0'),
            expect.stringContaining('Body B/1'),
            expect.stringContaining('Body C/2')
        ]);
        expect(results.map(result => result.gmailSender.emailVariant.subject?.key)).toEqual(['A', 'B', 'A', 'B', 'A', 'B']);
        expect(results.map(result => result.gmailSender.emailVariant.body?.key)).toEqual(['A', 'B', 'C', 'A', 'B', 'C']);
    });

    it('skips an initial outreach when any email was already sent to the recipient', async () => {
        const { executor, gmailClient } = setupGmailSenderTest();
        gmailClient.searchEmails.mockResolvedValueOnce([]).mockResolvedValueOnce([{
            id: 'existing-sent-thread'
        } as any]);

        const { results } = await executor.runConfig({
            taskConcurrency: 1,
            steps: [{
                plugins: [{
                    type: 'gmailSender',
                    to: 'Lead <LEAD@example.com>',
                    subject: 'A completely different subject',
                    body: 'Initial outreach body',
                    sendIfReceived: false,
                    skipIfAnySentToRecipient: true,
                    skipIfSubjectMatch: true,
                    replyToLastThread: false,
                    requireExistingThread: false,
                    output: { mode: 'merge' }
                }]
            }]
        }, [{}]);

        expect(gmailClient.searchEmails).toHaveBeenNthCalledWith(1, 'from:lead@example.com');
        expect(gmailClient.searchEmails).toHaveBeenNthCalledWith(2, 'in:sent to:lead@example.com');
        expect(gmailClient.sendEmail).not.toHaveBeenCalled();
        expect(results[0].gmailSender).toEqual(expect.objectContaining({
            status: 'skipped',
            reason: 'sent_to_recipient'
        }));
    });

    it('skips a resumed reply when the campaign marker is already in the thread', async () => {
        const { executor, gmailClient } = setupGmailSenderTest();
        gmailClient.searchEmails.mockResolvedValueOnce([]).mockResolvedValueOnce([{
            id: 'thread-1',
            isUnread: false
        } as any]);
        gmailClient.readThread.mockResolvedValueOnce([{
            senderName: 'Tobias',
            senderEmail: 'tobias@example.com',
            date: 'today',
            textBody: 'Video ansehen',
            htmlBody: '<a href="https://example.com/follow-up-marker">Video ansehen</a>'
        }]);

        const { results } = await executor.runConfig({
            taskConcurrency: 1,
            steps: [{
                plugins: [{
                    type: 'gmailSender',
                    to: 'lead@example.com',
                    subject: 'Original subject',
                    body: 'Follow-up body',
                    sendIfReceived: false,
                    skipIfSubjectMatch: true,
                    skipIfThreadBodyContains: 'follow-up-marker',
                    replyToLastThread: true,
                    requireExistingThread: true,
                    output: { mode: 'merge' }
                }]
            }]
        }, [{}]);

        expect(gmailClient.sendEmail).not.toHaveBeenCalled();
        expect(gmailClient.readThread).toHaveBeenCalledWith('thread-1', {
            setReadStatus: true,
            wasUnread: false
        });
        expect(results[0].gmailSender).toEqual(expect.objectContaining({
            status: 'skipped',
            reason: 'thread_body_match',
            replyToId: 'thread-1'
        }));
    });

    it('sends a reply when the campaign marker is absent and ignores the original subject match', async () => {
        const { executor, gmailClient } = setupGmailSenderTest();
        gmailClient.searchEmails.mockResolvedValueOnce([]).mockResolvedValueOnce([{
            id: 'thread-2',
            isUnread: true
        } as any]);
        gmailClient.readThread.mockResolvedValueOnce([{
            senderName: 'Tobias',
            senderEmail: 'tobias@example.com',
            date: 'today',
            textBody: 'Original contact',
            htmlBody: '<p>Original contact</p>'
        }]);

        await executor.runConfig({
            taskConcurrency: 1,
            steps: [{
                plugins: [{
                    type: 'gmailSender',
                    to: 'lead@example.com',
                    subject: 'Original subject',
                    body: 'Follow-up with follow-up-marker',
                    sendIfReceived: false,
                    skipIfSubjectMatch: true,
                    skipIfThreadBodyContains: 'follow-up-marker',
                    replyToLastThread: true,
                    requireExistingThread: true,
                    output: { mode: 'merge' }
                }]
            }]
        }, [{}]);

        expect(gmailClient.searchEmails).toHaveBeenCalledTimes(2);
        expect(gmailClient.readThread).toHaveBeenCalledWith('thread-2', {
            setReadStatus: false,
            wasUnread: true
        });
        expect(gmailClient.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            to: 'lead@example.com',
            subject: 'Original subject',
            replyToId: 'thread-2'
        }));
    });

    it('keeps an explicit reply thread and skips a reply sent from an alias in another matching thread', async () => {
        const { executor, gmailClient } = setupGmailSenderTest();
        gmailClient.searchEmails.mockResolvedValueOnce([]).mockResolvedValueOnce([
            { id: 'newer-thread', isUnread: true } as any,
            { id: 'approved-thread', isUnread: false } as any
        ]);
        gmailClient.readThread
            .mockResolvedValueOnce([{
                senderName: 'Manager',
                senderEmail: 'manager@example.com',
                date: 'today',
                textBody: 'Please call me.',
                htmlBody: '<p>Please call me.</p>'
            }])
            .mockResolvedValueOnce([{
                senderName: 'Tobias',
                senderEmail: 'tobias@example.com',
                date: 'yesterday',
                textBody: 'Original contact',
                htmlBody: '<p>Original contact</p>'
            }]);

        const { results } = await executor.runConfig({
            taskConcurrency: 1,
            steps: [{
                plugins: [{
                    type: 'gmailSender',
                    to: 'lead@example.com',
                    subject: 'Original subject',
                    body: 'Follow-up with follow-up-marker',
                    replyToId: 'approved-thread',
                    sendIfReceived: false,
                    skipIfThreadBodyContains: 'follow-up-marker',
                    replyToLastThread: true,
                    requireExistingThread: true,
                    output: { mode: 'merge' }
                }]
            }]
        }, [{}]);

        expect(gmailClient.sendEmail).not.toHaveBeenCalled();
        expect(results[0].gmailSender).toEqual(expect.objectContaining({
            status: 'skipped',
            reason: 'thread_received_email',
            replyToId: 'approved-thread'
        }));
    });

    it('keeps an explicit reply thread when another self-only thread is newer', async () => {
        const { executor, gmailClient } = setupGmailSenderTest();
        gmailClient.searchEmails.mockResolvedValueOnce([]).mockResolvedValueOnce([
            { id: 'newer-thread', isUnread: false } as any,
            { id: 'approved-thread', isUnread: false } as any
        ]);
        gmailClient.readThread.mockResolvedValue([{
            senderName: 'Tobias',
            senderEmail: 'tobias@example.com',
            date: 'today',
            textBody: 'Original contact',
            htmlBody: '<p>Original contact</p>'
        }]);

        await executor.runConfig({
            taskConcurrency: 1,
            steps: [{
                plugins: [{
                    type: 'gmailSender',
                    to: 'lead@example.com',
                    subject: 'Original subject',
                    body: 'Follow-up with follow-up-marker',
                    replyToId: 'approved-thread',
                    sendIfReceived: false,
                    skipIfThreadBodyContains: 'follow-up-marker',
                    replyToLastThread: true,
                    requireExistingThread: true,
                    output: { mode: 'merge' }
                }]
            }]
        }, [{}]);

        expect(gmailClient.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            to: 'lead@example.com',
            replyToId: 'approved-thread'
        }));
    });

    it('parses the lead-gen send config with subject/body arrays', async () => {
        const { registry } = setupGmailSenderTest();
        const configPath = path.resolve(process.cwd(), '../../apps/batchprompt-cli/examples/02-lead-gen/05-send/config-5-send.json');
        const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));

        const schema = createPipelineSchema(registry);
        const parsed = await schema.parseAsync(config);
        const gmailSenderConfig = parsed.steps[0].plugins[0];

        expect(gmailSenderConfig.subject).toHaveLength(2);
        expect(gmailSenderConfig.body).toHaveLength(2);
        expect(gmailSenderConfig.body[0].key).toBe('A');
        expect(gmailSenderConfig.skipIfAnySentToRecipient).toBe(true);
    });
});
