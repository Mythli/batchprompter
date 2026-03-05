import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Browser, Page } from 'puppeteer';
import { ensureAuthenticatedGmail } from './auth.js';
import { searchEmails } from './search.js';
import { sendEmail } from './send.js';
import { testEnv, launchTestBrowser } from './test-utils.js';

describe('Gmail Send Integration', () => {
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

  it('should send a new HTML email and then reply to it', async () => {
    const uniqueSubject = `Test Email ${Date.now()}`;
    const htmlBody = `<h1>Hello!</h1><p>This is a test email sent at ${new Date().toISOString()}</p>`;

    // 1. Send a new email to ourselves
    await sendEmail(page, {
      to: testEnv.GMAIL_EMAIL,
      subject: uniqueSubject,
      htmlBody: htmlBody
    });

    // Wait a moment for the email to be processed and arrive in the inbox
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 2. Search for the email to get its ID
    const searchResults = await searchEmails(page, `subject:"${uniqueSubject}"`);
    
    expect(searchResults.length).toBeGreaterThan(0);
    
    const emailId = searchResults[0].id;
    expect(emailId).toBeTruthy();

    // 3. Reply to the email using the extracted ID
    const replyHtmlBody = `<h2>Reply!</h2><p>This is a reply to the test email.</p>`;
    await sendEmail(page, {
      htmlBody: replyHtmlBody,
      replyToId: emailId
    });

    // Wait a moment for the reply to process
    await new Promise(resolve => setTimeout(resolve, 5000));

    // If we got here without throwing, the Puppeteer actions succeeded.
  }, 120000);
});
