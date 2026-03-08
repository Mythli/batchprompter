import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Browser } from 'puppeteer';
import { createGmailClient, GmailClient } from './client.js';
import { testEnv, launchTestBrowser } from './test-utils.js';

describe('Gmail Read Integration', () => {
  let browser: Browser;
  let client: GmailClient;

  beforeAll(async () => {
    browser = await launchTestBrowser();
    
    // Initialize the client exactly as a consumer would
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

  it('should search for YEAH2 email and read the entire thread', async () => {
    console.log('\n--- Starting YEAH2 Test ---');
    
    // 1. Search using the client (includes retries)
    const searchResults = await client.searchEmails('subject:"YEAH2"');

    if (searchResults.length === 0) {
      throw new Error('Could not find an email with subject "YEAH2" to run the read test. Please ensure one exists in the inbox.');
    }

    const threadId = searchResults[0].id;
    console.log(`[Test] Found YEAH2 email. Extracted ID: ${threadId}`);
    expect(threadId).toBeTruthy();

    // 2. Read using the client (includes retries)
    const messages = await client.readThread(threadId);

    // 3. Assertions
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThanOrEqual(1);

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
  }, 120000);

  it('should toggle read status and respect keepUnread parameter', async () => {
    const uniqueSubject = `Read Status Test ${Date.now()}`;
    let threadId: string;

    console.log('\n--- Starting Toggle Read Status Test ---');
    console.log(`[Test] Sending test email with subject: "${uniqueSubject}"`);
    
    await client.sendEmail({
      to: testEnv.GMAIL_EMAIL,
      subject: uniqueSubject,
      htmlBody: `<p>Testing read status toggling.</p>`
    });

    // Wait for email to arrive in the inbox by polling
    let searchResults = await client.searchEmails(`subject:"${uniqueSubject}"`);
    let attempts = 0;
    while (searchResults.length === 0 && attempts < 15) {
      await new Promise<void>(resolve => {
        const timer = setInterval(() => {
          clearInterval(timer);
          resolve();
        }, 1000);
      });
      searchResults = await client.searchEmails(`subject:"${uniqueSubject}"`);
      attempts++;
    }
    
    expect(searchResults.length).toBeGreaterThan(0);
    
    threadId = searchResults[0].id;
    console.log(`[Test] Found test email. Extracted ID: ${threadId}`);
    expect(searchResults[0].isUnread).toBe(true); 

    // 3. Read it with keepUnread: false
    console.log(`[Test] Reading thread with keepUnread: false`);
    await client.readThread(threadId, { keepUnread: false });

    // Verify it is now read
    let checkResults = await client.searchEmails(`subject:"${uniqueSubject}"`);
    expect(checkResults[0].isUnread).toBe(false);

    // 4. Mark it as unread explicitly
    console.log(`[Test] Explicitly setting read status to false (unread)`);
    await client.setThreadReadStatus(threadId, false);

    // Verify it is now unread
    checkResults = await client.searchEmails(`subject:"${uniqueSubject}"`);
    expect(checkResults[0].isUnread).toBe(true);

    // 5. Read it with keepUnread: true (default behavior)
    console.log(`[Test] Reading thread with keepUnread: true (default)`);
    await client.readThread(threadId); 

    // Verify it is STILL unread
    checkResults = await client.searchEmails(`subject:"${uniqueSubject}"`);
    expect(checkResults[0].isUnread).toBe(true);

    // 6. Mark it as read explicitly
    console.log(`[Test] Explicitly setting read status to true (read)`);
    await client.setThreadReadStatus(threadId, true);

    // Verify it is now read
    checkResults = await client.searchEmails(`subject:"${uniqueSubject}"`);
    expect(checkResults[0].isUnread).toBe(false);

  }, 180000);
});
