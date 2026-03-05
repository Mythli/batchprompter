import type { Browser, Page } from 'puppeteer';

export interface GmailAuthOptions {
  email?: string;
  password?: string;
  /**
   * Optional timeout in milliseconds for navigation and waiting for selectors.
   * Default is 30000 (30 seconds).
   */
  timeout?: number;
}

/**
 * Ensures that the browser is authenticated with Gmail.
 * Navigates to Gmail, detects if redirected to the login page, and performs login if needed.
 * 
 * @param browser The Puppeteer Browser instance.
 * @param options Authentication options including email and password.
 * @returns A Promise that resolves to the authenticated Gmail Page (tab).
 */
export async function ensureAuthenticatedGmail(
  browser: Browser,
  options: GmailAuthOptions = {}
): Promise<Page> {
  const timeout = options.timeout ?? 30000;
  const page = await browser.newPage();
  
  // Auto-dismiss any unexpected JavaScript dialogs so they don't block execution
  page.on('dialog', async (dialog) => {
    await dialog.dismiss().catch(() => {});
  });

  // Prevent Gmail from asking to be the default email handler (protocol handler prompt)
  await page.evaluateOnNewDocument(() => {
    if (window.navigator) {
      window.navigator.registerProtocolHandler = function() {};
    }
  });
  
  // Navigate to Gmail
  await page.goto('https://mail.google.com/', { waitUntil: 'networkidle2', timeout });

  const currentUrl = page.url();

  // Check if we were redirected to the Google Accounts login page
  if (currentUrl.includes('accounts.google.com')) {
    if (!options.email || !options.password) {
      throw new Error('Authentication required: Redirected to login page, but email or password were not provided.');
    }

    // 1. Enter Email
    await page.waitForSelector('input[type="email"]', { visible: true, timeout });
    await page.type('input[type="email"]', options.email, { delay: 50 });
    
    // Click "Next" after email
    await page.click('#identifierNext');

    // 2. Enter Password
    // The password field might take a moment to become visible and interactable
    await page.waitForSelector('input[type="password"]', { visible: true, timeout });
    
    // Small delay to ensure the animation finishes and the field is fully interactable
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await page.type('input[type="password"]', options.password, { delay: 50 });
    
    // Click "Next" after password
    await page.click('#passwordNext');

    // 3. Wait for successful login and redirect back to Gmail
    try {
      await page.waitForFunction(
        () => window.location.hostname === 'mail.google.com',
        { timeout: 60000 } // Give it up to 60 seconds to complete the login redirect
      );
    } catch (error) {
      throw new Error(`Failed to reach mail.google.com after login attempt. Current URL: ${page.url()}`);
    }
  }

  // Final verification that we are on the right domain
  if (!page.url().includes('mail.google.com')) {
    throw new Error(`Failed to authenticate. Ended up at unexpected URL: ${page.url()}`);
  }

  return page;
}
