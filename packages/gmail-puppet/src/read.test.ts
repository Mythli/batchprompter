import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Browser, Page } from 'puppeteer';
import { ensureAuthenticatedGmail } from './auth.js';
import { searchEmails } from './search.js';
import { readThread } from './read.js';
import { testEnv, launchTestBrowser } from './test-utils.js';

describe('Gmail Read Integration', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await launchTestBrowser();
  }, 120000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  }, 120000);

  // Helper to run a test with a fresh page, matching the new client architecture
  async function withPage<T>(action: (page: Page) => Promise<T>): Promise<T> {
    const page = await ensureAuthenticatedGmail(browser, {
      email: testEnv.GMAIL_EMAIL,
      password: testEnv.GMAIL_PASSWORD,
    });
    try {
      return await action(page);
    } finally {
      await page.close().catch(() => {});
    }
  }

  it('should search for YEAH2 email and read the entire thread', async () => {
    await withPage(async (page) => {
      console.log('\n--- Starting YEAH2 Test ---');
      // 1. Search for the existing email with subject "YEAH2"
      const searchResults = await searchEmails(page, 'subject:"YEAH2"');

      if (searchResults.length === 0) {
        throw new Error('Could not find an email with subject "YEAH2" to run the read test. Please ensure one exists in the inbox.');
      }

      const threadId = searchResults[0].id;
      console.log(`[Test] Found YEAH2 email. Extracted ID: ${threadId}`);
      expect(threadId).toBeTruthy();

      // 2. Read the thread using the ID
      const messages = await readThread(page, threadId);

      // 3. Assertions
      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThanOrEqual(1);

      // Verify the structure of the first message
      const firstMessage = messages[0];

      expect(firstMessage).toHaveProperty('senderName');
      expect(typeof firstMessage.senderName).toBe('string');

      expect(firstMessage).toHaveProperty('senderEmail');
      expect(typeof firstMessage.senderEmail).toBe('string');
      expect(firstMessage.senderEmail).toContain('@');

      expect(firstMessage).toHaveProperty('date');
      expect(typeof firstMessage.date).toBe('string');

      expect(firstMessage).toHaveProperty('textBody');
      expect(typeof firstMessage.textBody).toBe('string');

      expect(firstMessage).toHaveProperty('htmlBody');
      expect(typeof firstMessage.htmlBody).toBe('string');
    });
  }, 120000);
});
