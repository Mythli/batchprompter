import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Browser, Page } from 'puppeteer';
import { ensureAuthenticatedGmail } from './auth.js';
import { searchEmails } from './search.js';
import { readThread, setThreadReadStatus } from './read.js';
import { sendEmail } from './send.js';
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
    console.log('\n--- Starting YEAH2 Test ---');
    // 1. Search for the existing email with subject "YEAH2"
    const searchResults = await searchEmails(page, 'subject:"YEAH2"');

    if (searchResults.length === 0) {
      throw new Error('Could not find an email with subject "YEAH2" to run the read test. Please ensure one exists in the inbox.');
    }

    const threadId = searchResults[0].id;
    console.log(`[Test] Found YEAH2 email. Extracted ID: ${threadId}`);
    expect(threadId).toBeTruthy();

    // 2. Read the thread using the ID (default keepUnread: true)
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
  }, 120000);

  it('should toggle read status and respect keepUnread parameter', async () => {
    console.log('\n--- Starting Toggle Read Status Test ---');
    // 1. Send a unique test email to ourselves to ensure we have a clean thread to test
    const uniqueSubject = `Read Status Test ${Date.now()}`;
    console.log(`[Test] Sending test email with subject: "${uniqueSubject}"`);

    await sendEmail(page, {
      to: testEnv.GMAIL_EMAIL,
      subject: uniqueSubject,
      htmlBody: `<p>Testing read status toggling.</p>`
    });

    console.log(`[Test] Waiting 5 seconds for email to arrive...`);
    // Wait for email to arrive in the inbox
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 2. Search for it
    const searchResults = await searchEmails(page, `subject:"${uniqueSubject}"`);
    expect(searchResults.length).toBeGreaterThan(0);

    const threadId = searchResults[0].id;
    console.log(`[Test] Found test email. Extracted ID: ${threadId}`);
    expect(searchResults[0].isUnread).toBe(true); // Should be unread initially

    console.log(`[Test] Reading thread with keepUnread: false`);
    // 3. Read it with keepUnread: false
    await readThread(page, threadId, { keepUnread: false });

    console.log(`[Test] Waiting 60 seconds for manual debugging...`);
    await new Promise(resolve => setTimeout(resolve, 60000));

    // Verify it is now read
    let checkResults = await searchEmails(page, `subject:"${uniqueSubject}"`);
    expect(checkResults[0].isUnread).toBe(false);

    console.log(`[Test] Explicitly setting read status to false (unread)`);
    // 4. Mark it as unread explicitly
    await setThreadReadStatus(page, threadId, false);

    // Verify it is now unread
    checkResults = await searchEmails(page, `subject:"${uniqueSubject}"`);
    expect(checkResults[0].isUnread).toBe(true);

    console.log(`[Test] Reading thread with keepUnread: true (default)`);
    // 5. Read it with keepUnread: true (default behavior)
    await readThread(page, threadId, { keepUnread: true });

    // Verify it is STILL unread
    checkResults = await searchEmails(page, `subject:"${uniqueSubject}"`);
    expect(checkResults[0].isUnread).toBe(true);

    console.log(`[Test] Explicitly setting read status to true (read)`);
    // 6. Mark it as read explicitly
    await setThreadReadStatus(page, threadId, true);

    // Verify it is now read
    checkResults = await searchEmails(page, `subject:"${uniqueSubject}"`);
    expect(checkResults[0].isUnread).toBe(false);

  }, 180000); // Increased timeout to 180s to accommodate the 60s debug wait
});
