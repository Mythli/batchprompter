import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { Browser } from 'puppeteer';
import { ensureAuthenticatedGmail } from './auth.js';
import * as dotenv from 'dotenv';

// Load environment variables from .env file if present
dotenv.config();

describe('Gmail Authentication Integration', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      // Use headless: false if you need to visually debug the login flow locally
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  const hasCredentials = !!(process.env.GMAIL_EMAIL && process.env.GMAIL_PASSWORD);

  it.skipIf(!hasCredentials)('should authenticate and navigate to Gmail', async () => {
    const email = process.env.GMAIL_EMAIL;
    const password = process.env.GMAIL_PASSWORD;

    // This shouldn't happen due to skipIf, but satisfies TypeScript
    if (!email || !password) {
      throw new Error('Missing credentials');
    }

    const page = await ensureAuthenticatedGmail(browser, {
      email,
      password,
      timeout: 60000 // 60 seconds timeout for navigation/selectors
    });

    const url = page.url();
    
    // Verify we ended up on the Gmail domain
    expect(url).toContain('mail.google.com');

    // Clean up the page after the test
    await page.close();
  }, 120000); // 120 seconds timeout for the entire test
});
