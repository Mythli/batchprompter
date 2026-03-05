import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Browser, Page } from 'puppeteer';
import { ensureAuthenticatedGmail } from './auth.js';
import { searchEmails } from './search.js';
import { sendEmail } from './send.js';
import { readThread } from './read.js';
import { testEnv, launchTestBrowser } from './test-utils.js';

describe('Gmail Read Integration', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await launchTestBrowser();
    page = await ensureAuthenticatedGmail(browser, {
      email: testEnv.GMAIL_EMAIL,
      password: testEnv.GMAIL_PASSWORD,
    });
  }, 120000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  }, 120000);

  it('should search for YEAH2 email and read the entire thread', async () => {
    // Use a unique subject so we don't clash with previous test runs
    const uniqueSubject = `YEAH2 ${Date.now()}`;
    
    // 1. Setup: Create a thread by sending an email and then replying to it
    await sendEmail(page, {
      to: testEnv.GMAIL_EMAIL,
      subject: uniqueSubject,
      htmlBody: '<p>This is the first message in the YEAH2 thread.</p>'
    });
    
    // Wait for the email to arrive
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Search to get the ID
    const searchResults = await searchEmails(page, `subject:"${uniqueSubject}"`);
    expect(searchResults.length).toBeGreaterThan(0);
    const threadId = searchResults[0].id;

    // Reply to create a thread with multiple messages
    await sendEmail(page, {
      replyToId: threadId,
      htmlBody: '<p>This is the second message (reply) in the YEAH2 thread.</p>'
    });

    // Wait for the reply to process
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 2. Actual Test: Read the thread using the ID
    const messages = await readThread(page, threadId);

    // Assertions
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThanOrEqual(2);

    // Verify the first message
    const firstMessage = messages[0];
    expect(firstMessage).toHaveProperty('senderEmail');
    expect(firstMessage.senderEmail).toContain('@');
    expect(firstMessage.textBody).toContain('first message');

    // Verify the last message (the reply)
    const lastMessage = messages[messages.length - 1];
    expect(lastMessage.textBody).toContain('second message');
  }, 120000);
});
