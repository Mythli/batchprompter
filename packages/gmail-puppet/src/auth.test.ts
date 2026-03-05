import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Browser } from 'puppeteer';
import { ensureAuthenticatedGmail } from './auth.js';
import { testEnv, launchTestBrowser } from './test-utils.js';

describe('Gmail Authentication Integration', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await launchTestBrowser();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it('should authenticate and navigate to Gmail', async () => {
    const page = await ensureAuthenticatedGmail(browser, {
      email: testEnv.GMAIL_EMAIL,
      password: testEnv.GMAIL_PASSWORD,
      timeout: 60000 // 60 seconds timeout for navigation/selectors
    });

    const url = page.url();
    
    // Verify we ended up on the Gmail domain
    expect(url).toContain('mail.google.com');

    // Clean up the page after the test
    await page.close();
  }, 120000); // 120 seconds timeout for the entire test
});
