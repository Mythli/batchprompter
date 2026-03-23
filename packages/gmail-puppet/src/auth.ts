import type { Page } from 'puppeteer';

export interface GmailAuthOptions {
  email?: string;
  password?: string;
  /**
   * Optional timeout in milliseconds for navigation and waiting for selectors.
   * Default is 30000 (30 seconds).
   */
  timeout?: number;
  /**
   * The specific Gmail URL to navigate to. 
   * If not provided, defaults to the base inbox URL.
   */
  targetUrl?: string;
  /**
   * Optional callback to resolve CAPTCHAs if they appear during login.
   * Receives a base64 encoded PNG of the CAPTCHA image.
   * Should return the solved text.
   */
  resolveCaptcha?: (base64Image: string) => Promise<string>;
}

async function solveCaptchaIfPresent(
  page: Page, 
  resolveCaptcha?: (base64: string) => Promise<string>, 
  nextButtonSelector: string = '#identifierNext',
  passwordToRetype?: string
): Promise<boolean> {
  const captchaImg = await page.$('img#captchaimg');
  if (!captchaImg) return false;
  
  const isVisible = await captchaImg.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0;
  });

  if (!isVisible) return false;

  if (!resolveCaptcha) {
    throw new Error('CAPTCHA detected during login, but no resolveCaptcha function was provided.');
  }

  console.log('[Gmail Auth] CAPTCHA detected. Requesting resolution...');
  const buffer = await captchaImg.screenshot({ encoding: 'base64' });
  const solution = await resolveCaptcha(`data:image/png;base64,${buffer}`);
  console.log(`[Gmail Auth] CAPTCHA solved: ${solution}`);
  
  const captchaInput = await page.$('input#ca');
  if (captchaInput) {
    await captchaInput.click({ clickCount: 3 }); // clear existing
    await captchaInput.type(solution, { delay: 50 });
  }

  // If we are on the password step, the CAPTCHA sometimes clears the password field
  if (passwordToRetype) {
    const pwdInput = await page.$('input[type="password"]');
    if (pwdInput) {
      const val = await page.evaluate(el => (el as HTMLInputElement).value, pwdInput);
      if (!val) {
        await pwdInput.type(passwordToRetype, { delay: 50 });
      }
    }
  }

  await page.click(nextButtonSelector);
  return true;
}

/**
 * Ensures that the browser is authenticated with Gmail and navigates to the target URL.
 * Detects if redirected to the login page, and performs login if needed.
 * 
 * @param page The Puppeteer Page instance.
 * @param options Authentication options including email, password, and targetUrl.
 * @returns A Promise that resolves to the authenticated Gmail Page (tab).
 */
export async function ensureAuthenticatedGmail(
  page: Page,
  options: GmailAuthOptions = {}
): Promise<Page> {
  const timeout = options.timeout ?? 30000;
  const targetUrl = options.targetUrl ?? 'https://mail.google.com/mail/u/0/';
  
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
  
  // Navigate to the target URL. We use domcontentloaded because Gmail's SPA 
  // has many persistent background connections that cause networkidle2 to timeout.
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout });

  const currentUrl = page.url();

  // Check if we were redirected to the Google Accounts login page
  if (currentUrl.includes('accounts.google.com')) {
    if (!options.email || !options.password) {
      throw new Error('Authentication required: Redirected to login page, but email or password were not provided.');
    }

    // 1. Enter Email
    await page.waitForSelector('input[type="email"]', { visible: true, timeout });
    await page.type('input[type="email"]', options.email, { delay: 50 });
    await page.click('#identifierNext');

    // Wait for password field OR captcha
    await page.waitForFunction(() => {
      const pwd = document.querySelector('input[type="password"]:not([disabled])');
      const captcha = document.querySelector('img#captchaimg');
      return pwd || (captcha && (captcha as HTMLElement).offsetWidth > 0);
    }, { timeout });

    const solvedEmailCaptcha = await solveCaptchaIfPresent(page, options.resolveCaptcha, '#identifierNext');
    if (solvedEmailCaptcha) {
      // Wait for password field to become active after captcha submission
      await page.waitForFunction(() => {
        const input = document.querySelector('input[type="password"]');
        return input && !input.hasAttribute('disabled');
      }, { timeout });
    }

    // 2. Enter Password
    await page.waitForSelector('input[type="password"]', { visible: true, timeout });
    await page.waitForFunction(() => {
      const input = document.querySelector('input[type="password"]');
      return input && !input.hasAttribute('disabled');
    }, { timeout });
    
    await page.type('input[type="password"]', options.password, { delay: 50 });
    await page.click('#passwordNext');

    // Wait for success OR captcha
    await page.waitForFunction(() => {
      const isGmail = window.location.hostname === 'mail.google.com';
      const captcha = document.querySelector('img#captchaimg');
      return isGmail || (captcha && (captcha as HTMLElement).offsetWidth > 0);
    }, { timeout: 60000 });

    const solvedPwdCaptcha = await solveCaptchaIfPresent(page, options.resolveCaptcha, '#passwordNext', options.password);
    if (solvedPwdCaptcha) {
      // If we solved a captcha here, we need to wait again for success or another captcha
      await page.waitForFunction(() => {
        const isGmail = window.location.hostname === 'mail.google.com';
        const captcha = document.querySelector('img#captchaimg');
        return isGmail || (captcha && (captcha as HTMLElement).offsetWidth > 0);
      }, { timeout: 60000 });
    }

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
