import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Browser, Page } from 'puppeteer';
import { ensureAuthenticatedGmail } from './auth.js';
import { searchEmails } from './search.js';
import { sendEmail } from './send.js';
import { testEnv, launchTestBrowser } from './test-utils.js';

describe('Gmail Send Integration', () => {
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
    const page = await browser.newPage();
    await ensureAuthenticatedGmail(page, {
      email: testEnv.GMAIL_EMAIL,
      password: testEnv.GMAIL_PASSWORD,
    });
    try {
      return await action(page);
    } finally {
      await page.close().catch(() => {});
    }
  }

  it('should send a new HTML email', async () => {
    await withPage(async (page) => {
      const uniqueSubject = `Test Email ${Date.now()}`;
      const htmlBody = `<h1>Hello!</h1><p>This is a test email sent at ${new Date().toISOString()}</p>`;

      // Send a new email to ourselves
      await sendEmail(page, {
        to: testEnv.GMAIL_EMAIL,
        subject: uniqueSubject,
        htmlBody: htmlBody
      });

      // Wait a moment for the email to be processed and arrive in the inbox
      await new Promise(resolve => setTimeout(resolve, 5000));
    });
  }, 120000);

  it('should send a random email to tobiasan90@gmail.com', async () => {
    await withPage(async (page) => {
      const uniqueSubject = `Random Email ${Date.now()}`;
      await sendEmail(page, {
        to: 'tobiasan90@gmail.com',
        subject: uniqueSubject,
        htmlBody: `<h1>Hello!</h1><p>This is a random test email sent at ${new Date().toISOString()}</p>`
      });

      // Wait a moment for the email to be processed
      await new Promise(resolve => setTimeout(resolve, 5000));
    });
  }, 120000);

  it('should reply to an email with subject YEAH', async () => {
    await withPage(async (page) => {
      // Search for the email with subject "YEAH"
      const searchResults = await searchEmails(page, 'subject:"YEAH"');
      
      expect(searchResults.length).toBeGreaterThan(0);
      
      const emailId = searchResults[0].id;
      expect(emailId).toBeTruthy();

      // Reply to the email using the extracted ID
      const replyHtmlBody = `<p>This is a reply to the YEAH email.</p>`;
      await sendEmail(page, {
        htmlBody: replyHtmlBody,
        replyToId: emailId
      });

      // Wait a moment for the reply to process
      await new Promise(resolve => setTimeout(resolve, 5000));
    });
  }, 120000);
});
