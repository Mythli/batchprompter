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

  it('should send a new HTML email', async () => {
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
  }, 120000);

  it('should send a random email to tobiasan90@gmail.com', async () => {
    const uniqueSubject = `Random Email ${Date.now()}`;
    await sendEmail(page, {
      to: 'tobiasan90@gmail.com',
      subject: uniqueSubject,
      htmlBody: `<h1>Hello!</h1><p>This is a random test email sent at ${new Date().toISOString()}</p>`
    });

    // Wait a moment for the email to be processed
    await new Promise(resolve => setTimeout(resolve, 5000));
  }, 120000);

  it('should reply to an email with subject YEAH', async () => {
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
  }, 120000);

  it('should schedule an email to be sent later', async () => {
    const uniqueSubject = `Scheduled Email ${Date.now()}`;
    
    // Schedule for 5 minutes from now to ensure it's safely in the future
    const scheduleDate = new Date(Date.now() + 5 * 60 * 1000);

    await sendEmail(page, {
      to: testEnv.GMAIL_EMAIL,
      subject: uniqueSubject,
      htmlBody: `<h1>Scheduled!</h1><p>This email was scheduled for ${scheduleDate.toISOString()}</p>`,
      scheduleDate: scheduleDate
    });

    // Wait a moment for the scheduling to process
    await new Promise(resolve => setTimeout(resolve, 5000));
  }, 120000);
});
