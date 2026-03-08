import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Browser } from 'puppeteer';
import { createGmailClient, GmailClient } from './client.js';
import { testEnv, launchTestBrowser } from './test-utils.js';

describe('Gmail Search Integration', () => {
  let browser: Browser;
  let client: GmailClient;

  beforeAll(async () => {
    browser = await launchTestBrowser();
    client = createGmailClient({
      email: testEnv.GMAIL_EMAIL,
      password: testEnv.GMAIL_PASSWORD,
      usePage: async (action) => {
        const page = await browser.newPage();
        try {
          return await action(page);
        } finally {
          await page.close().catch(() => {});
        }
      }
    });
  }, 120000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  }, 120000);

  it('should return a list of emails from the inbox when query is empty', async () => {
    const emails = await client.searchEmails(undefined, 10);

    expect(Array.isArray(emails)).toBe(true);
    expect(emails.length).toBeLessThanOrEqual(10);

    if (emails.length > 0) {
      const firstEmail = emails[0];
      expect(firstEmail).toHaveProperty('id');
      expect(typeof firstEmail.id).toBe('string');
      expect(firstEmail.id.length).toBeGreaterThan(0);
      expect(firstEmail).toHaveProperty('sender');
      expect(typeof firstEmail.sender).toBe('string');
      expect(firstEmail).toHaveProperty('subject');
      expect(typeof firstEmail.subject).toBe('string');
      expect(firstEmail).toHaveProperty('snippet');
      expect(typeof firstEmail.snippet).toBe('string');
      expect(firstEmail).toHaveProperty('date');
      expect(typeof firstEmail.date).toBe('string');
      expect(firstEmail).toHaveProperty('isUnread');
      expect(typeof firstEmail.isUnread).toBe('boolean');
    }
  }, 60000);

  it('should return results for a specific search query', async () => {
    const emails = await client.searchEmails('is:unread', 10);
    expect(Array.isArray(emails)).toBe(true);
    if (emails.length > 0) {
      expect(emails[0].isUnread).toBe(true);
    }
  }, 60000);

  it('should paginate and fetch multiple pages when limit exceeds page size', async () => {
    const emails = await client.searchEmails(undefined, 60);
    expect(Array.isArray(emails)).toBe(true);
    expect(emails.length).toBe(60);
    console.log(`Pagination test fetched ${emails.length} emails.`);
  }, 120000);
});
