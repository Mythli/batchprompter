import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Browser } from 'puppeteer';
import { createGmailClient, GmailClient } from './client.js';
import { testEnv, launchTestBrowser } from './test-utils.js';

describe('Gmail Send Integration', () => {
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

  it('should send a new HTML email', async () => {
    const uniqueSubject = `Test Email ${Date.now()}`;
    const htmlBody = `<h1>Hello!</h1><p>This is a test email sent at ${new Date().toISOString()}</p>`;

    await client.sendEmail({
      to: testEnv.GMAIL_EMAIL,
      subject: uniqueSubject,
      htmlBody: htmlBody
    });

    await new Promise(resolve => setTimeout(resolve, 5000));
  }, 120000);

  it('should send a random email to tobiasan90@gmail.com', async () => {
    const uniqueSubject = `Random Email ${Date.now()}`;
    await client.sendEmail({
      to: 'tobiasan90@gmail.com',
      subject: uniqueSubject,
      htmlBody: `<h1>Hello!</h1><p>This is a random test email sent at ${new Date().toISOString()}</p>`
    });

    await new Promise(resolve => setTimeout(resolve, 5000));
  }, 120000);

  it('should reply to an email with subject YEAH', async () => {
    const searchResults = await client.searchEmails('subject:"YEAH"');
    expect(searchResults.length).toBeGreaterThan(0);
    
    const emailId = searchResults[0].id;
    expect(emailId).toBeTruthy();

    const replyHtmlBody = `<p>This is a reply to the YEAH email.</p>`;
    await client.sendEmail({
      htmlBody: replyHtmlBody,
      replyToId: emailId
    });

    await new Promise(resolve => setTimeout(resolve, 5000));
  }, 120000);
});
