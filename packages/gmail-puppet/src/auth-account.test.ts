import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import puppeteer, { type Browser } from 'puppeteer';
import {
  assertAuthenticatedGmailAccount,
  getAuthenticatedGmailEmail
} from './auth.js';

describe('authenticated Gmail account verification', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('reads the account email from the Gmail account control', async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <a
        href="https://accounts.google.com/SignOutOptions"
        aria-label="Google Account: Example User (Example.User@butlerapp.de)"
      >Account</a>
    `);

    await expect(getAuthenticatedGmailEmail(page))
      .resolves.toBe('example.user@butlerapp.de');
    await page.close();
  });

  it('refuses to continue when the browser and configured accounts differ', async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <a
        href="https://accounts.google.com/SignOutOptions"
        data-email="tobias@example.com"
      >Account</a>
    `);

    await expect(
      assertAuthenticatedGmailAccount(page, 'patrick@example.com', 50)
    ).rejects.toThrow('does not match configured account');
    await page.close();
  });
});
