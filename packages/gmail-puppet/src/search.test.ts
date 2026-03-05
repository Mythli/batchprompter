import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Browser, Page } from 'puppeteer';
import { ensureAuthenticatedGmail } from './auth.js';
import { searchEmails } from './search.js';
import { testEnv, launchTestBrowser } from './test-utils.js';

describe('Gmail Search Integration', () => {
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

  it('should return a list of emails from the inbox when query is empty', async () => {
    const emails = await searchEmails(page);
    
    expect(Array.isArray(emails)).toBe(true);
    
    // If the inbox isn't empty, verify the shape of the extracted data
    if (emails.length > 0) {
      const firstEmail = emails[0];
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
    // "is:unread" is a standard Gmail search operator
    const emails = await searchEmails(page, 'is:unread');
    
    expect(Array.isArray(emails)).toBe(true);
    
    // If there are unread emails, verify they are actually marked as unread
    if (emails.length > 0) {
      expect(emails[0].isUnread).toBe(true);
    }
  }, 60000);
});
