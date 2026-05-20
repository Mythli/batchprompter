import { describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { GmailSenderPlugin } from '../../src/plugins/gmail-sender/GmailSenderPlugin.js';
import { createPipelineSchema } from '../../src/config/index.js';
import { setupTestEnvironment } from '../utils/testUtils.js';

function setupGmailSenderTest() {
    const gmailClient = {
        sendEmail: vi.fn(async (_options: any) => {}),
        searchEmails: vi.fn(async () => []),
        readThread: vi.fn(async () => [])
    };

    const { executor, events, registry } = setupTestEnvironment({
        plugins: [new GmailSenderPlugin({ gmailClient: gmailClient as any })]
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
    });
});
