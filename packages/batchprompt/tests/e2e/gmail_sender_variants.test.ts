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
                    subject: 'Fallback subject',
                    body: 'Fallback body',
                    variants: [
                        { key: 'A', subject: 'Subject {{emailVariant.key}}', body: 'Body {{emailVariant.key}}/{{emailVariant.index}}' },
                        { key: 'B', subject: 'Subject {{emailVariant.key}}', body: 'Body {{emailVariant.key}}/{{emailVariant.index}}' },
                        { key: 'C', subject: 'Subject {{emailVariant.key}}', body: 'Body {{emailVariant.key}}/{{emailVariant.index}}' }
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
                    subject: 'Fallback subject',
                    body: 'Fallback body',
                    variant: '{{emailVariantColumn}}',
                    variants: [
                        { key: 'A', subject: 'Subject A', body: 'Body A' },
                        { key: 'B', subject: 'Subject {{emailVariant.key}}', body: 'Body {{emailVariant.index}}' }
                    ],
                    output: { mode: 'merge' }
                }]
            }]
        }, [{ emailVariantColumn: 'B' }]);

        expect(gmailClient.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            subject: 'Subject B'
        }));
        expect(sentEmail(gmailClient).htmlBody).toContain('Body 1');
        expect(results[0].gmailSender.emailVariant).toEqual({ key: 'B', index: 1 });
    });

    it('selects an explicit variant by rendered numeric index', async () => {
        const { executor, gmailClient } = setupGmailSenderTest();

        const { results } = await executor.runConfig({
            taskConcurrency: 1,
            steps: [{
                plugins: [{
                    type: 'gmailSender',
                    to: 'lead@example.com',
                    subject: 'Fallback subject',
                    body: 'Fallback body',
                    variant: '{{variantIndex}}',
                    variants: [
                        { key: 'A', subject: 'Subject A', body: 'Body A' },
                        { key: 'B', subject: 'Subject B', body: 'Body B' }
                    ],
                    output: { mode: 'merge' }
                }]
            }]
        }, [{ variantIndex: '1' }]);

        expect(gmailClient.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            subject: 'Subject B'
        }));
        expect(results[0].gmailSender.emailVariant).toEqual({ key: 'B', index: 1 });
    });

    it('falls back to top-level subject and body when a variant omits them', async () => {
        const { executor, gmailClient } = setupGmailSenderTest();

        const { results } = await executor.runConfig({
            taskConcurrency: 1,
            steps: [{
                plugins: [{
                    type: 'gmailSender',
                    to: 'lead@example.com',
                    subject: 'Fallback subject {{emailVariant.key}}',
                    body: 'Fallback body {{emailVariant.index}}',
                    variants: [
                        { key: 'A' }
                    ],
                    output: { mode: 'merge' }
                }]
            }]
        }, [{}]);

        expect(gmailClient.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            subject: 'Fallback subject A'
        }));
        expect(sentEmail(gmailClient).htmlBody).toContain('Fallback body 0');
        expect(results[0].gmailSender.emailVariant).toEqual({ key: 'A', index: 0 });
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
                    body: 'Body',
                    variants: [{ key: 'A' }],
                    output: { mode: 'merge' }
                }]
            }]
        }, [{}]);

        expect(sendEvents.find(event => event.event === 'send:started')?.data.emailVariant).toEqual({ key: 'A', index: 0 });
        expect(sendEvents.find(event => event.event === 'send:success')?.data.emailVariant).toEqual({ key: 'A', index: 0 });
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
                    body: 'Body',
                    variant: '{{emailVariantColumn}}',
                    variants: [{ key: 'A' }, { key: 'B' }],
                    output: { mode: 'merge' }
                }]
            }]
        }, [{ emailVariantColumn: 'Z' }]);

        expect(gmailClient.sendEmail).not.toHaveBeenCalled();
        expect(results).toEqual([]);
        expect(errors[0].message).toContain("variant 'Z' was not found");
    });

    it('parses the lead-gen send config with variants', async () => {
        const { registry } = setupGmailSenderTest();
        const configPath = path.resolve(process.cwd(), '../../apps/batchprompt-cli/examples/02-lead-gen/05-send/config-5-send.json');
        const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));

        const schema = createPipelineSchema(registry);
        const parsed = await schema.parseAsync(config);
        const gmailSenderConfig = parsed.steps[0].plugins[0];

        expect(gmailSenderConfig.variants).toHaveLength(2);
        expect(gmailSenderConfig.variants[0].key).toBe('A');
    });
});
