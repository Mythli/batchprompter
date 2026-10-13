import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureAuthenticatedGmail: vi.fn(),
  sendEmail: vi.fn()
}));

vi.mock('./auth.js', () => ({
  ensureAuthenticatedGmail: mocks.ensureAuthenticatedGmail
}));

vi.mock('./send.js', () => ({
  sendEmail: mocks.sendEmail
}));

import { GmailClient } from './client.js';

describe('GmailClient send retry safety', () => {
  beforeEach(() => {
    mocks.ensureAuthenticatedGmail.mockReset().mockResolvedValue(undefined);
    mocks.sendEmail.mockReset();
  });

  it('does not repeat a send after the Send button reached an unconfirmed state', async () => {
    const unconfirmedError = Object.assign(new Error('send confirmation missing'), {
      retryable: false
    });
    mocks.sendEmail.mockRejectedValue(unconfirmedError);

    const page = {
      evaluate: vi.fn().mockResolvedValue(false)
    };
    const usePage = vi.fn(async (action: (page: any) => Promise<any>) => action(page));
    const client = new GmailClient({
      email: 'sender@example.com',
      password: 'test-password',
      usePage
    });

    await expect(client.sendEmail({
      to: 'recipient@example.com',
      subject: 'Test',
      htmlBody: '<p>Test</p>'
    })).rejects.toBe(unconfirmedError);

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    // One page authenticates the shared browser session and one page performs
    // the send. A retry would increase this count.
    expect(usePage).toHaveBeenCalledTimes(2);
  });
});
