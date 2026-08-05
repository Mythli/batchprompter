import type { Page } from 'puppeteer';

const EMAIL_SELECTOR = 'input[name="identifier"], input#identifierId, input[type="email"]';
const PASSWORD_SELECTOR = 'input[name="Passwd"], input[type="password"]:not([name="hiddenPassword"])';
const ACCOUNT_IDENTITY_SELECTOR = [
  'a[href*="SignOutOptions"]',
  'a[aria-label^="Google Account"]',
  'a[aria-label^="Google-Konto"]',
  '[data-email][role="button"]',
  '[data-email][role="link"]'
].join(', ');

async function fillSignInInput(page: Page, selector: string, value: string): Promise<void> {
  const input = await page.waitForSelector(selector, { visible: true });
  if (!input) throw new Error(`Could not find a visible sign-in input matching: ${selector}`);

  await input.click({ count: 3 });
  await input.press('Backspace');
  await input.type(value, { delay: 50 });
}

async function clickSignInNext(page: Page, legacySelector: string): Promise<void> {
  const clicked = await page.evaluate((oldSelector) => {
    const candidates = [
      document.querySelector(oldSelector),
      document.querySelector('button[jsname="LgbsSe"]'),
      ...Array.from(document.querySelectorAll('button')).filter((button) => {
        const text = (button.textContent || '').trim().toLowerCase();
        return text === 'next' || text === 'weiter';
      })
    ];
    const button = candidates.find((candidate) => {
      if (!(candidate instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(candidate);
      return style.display !== 'none' && style.visibility !== 'hidden'
        && candidate.offsetWidth > 0 && candidate.offsetHeight > 0;
    });
    (button as HTMLElement | undefined)?.click();
    return Boolean(button);
  }, legacySelector);

  if (!clicked) {
    throw new Error(`Could not find the Google sign-in Next button (legacy selector: ${legacySelector}).`);
  }
}

async function getSignInError(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const messages = Array.from(document.querySelectorAll('[role="alert"], [aria-live="assertive"]'))
      .filter((element) => {
        const htmlElement = element as HTMLElement;
        const style = window.getComputedStyle(htmlElement);
        return style.display !== 'none' && style.visibility !== 'hidden'
          && htmlElement.offsetWidth > 0 && htmlElement.offsetHeight > 0;
      })
      .map((element) => (element.textContent || '').trim())
      .filter((message) => message && message.toLowerCase() !== 'welcome');
    return messages[0] || null;
  });
}

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
    await captchaInput.click({ count: 3 }); // clear existing
    await captchaInput.type(solution, { delay: 50 });
  }

  // If we are on the password step, the CAPTCHA sometimes clears the password field
  if (passwordToRetype) {
    const pwdInput = await page.$(PASSWORD_SELECTOR);
    if (pwdInput) {
      const val = await page.evaluate(el => (el as HTMLInputElement).value, pwdInput);
      if (!val) {
        await pwdInput.type(passwordToRetype, { delay: 50 });
      }
    }
  }

  await clickSignInNext(page, nextButtonSelector);
  return true;
}

async function hasVisibleSelector(page: Page, selector: string): Promise<boolean> {
  const element = await page.$(selector);
  if (!element) return false;

  return element.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && (el as HTMLElement).offsetWidth > 0;
  }).catch(() => false);
}

async function clickAccountChooserIfPresent(page: Page, email: string, timeout: number): Promise<void> {
  const isAccountsPage = page.url().includes('accounts.google.com');
  if (!isAccountsPage) return;

  if (await hasVisibleSelector(page, EMAIL_SELECTOR)) {
    return;
  }

  const clicked = await page.evaluate((targetEmail) => {
    const normalize = (value: string | null | undefined) => (value || '').trim().toLowerCase();
    const target = normalize(targetEmail);

    const isVisible = (element: Element) => {
      const htmlElement = element as HTMLElement;
      const style = window.getComputedStyle(htmlElement);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && htmlElement.offsetWidth > 0
        && htmlElement.offsetHeight > 0;
    };

    const clickElement = (element: Element) => {
      const clickable = element.closest('[data-identifier], [data-email], [role="link"], [role="button"], button, a') || element;
      (clickable as HTMLElement).click();
    };

    const exactAttributeAccount = Array.from(document.querySelectorAll('[data-identifier], [data-email]')).find((element) => {
      const identifier = normalize(element.getAttribute('data-identifier'));
      const dataEmail = normalize(element.getAttribute('data-email'));
      return isVisible(element) && (identifier === target || dataEmail === target);
    });

    if (exactAttributeAccount) {
      clickElement(exactAttributeAccount);
      return 'account';
    }

    const accountCandidates = Array.from(document.querySelectorAll('[data-identifier], [data-email], [role="link"], [role="button"], li, div'))
      .filter((element) => isVisible(element) && normalize(element.textContent).includes(target))
      .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);

    if (accountCandidates[0]) {
      clickElement(accountCandidates[0]);
      return 'account';
    }

    const useAnotherAccount = accountCandidates.find((element) => {
      const text = normalize(element.textContent);
      return text.includes('use another account') || text.includes('anderes konto verwenden');
    }) || Array.from(document.querySelectorAll('[role="link"], [role="button"], li, div'))
      .filter(isVisible)
      .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)
      .find((element) => {
        const text = normalize(element.textContent);
        return text.includes('use another account') || text.includes('anderes konto verwenden');
      });

    if (useAnotherAccount) {
      clickElement(useAnotherAccount);
      return 'use-another-account';
    }

    return null;
  }, email);

  if (!clicked) return;

  await page.waitForFunction(() => {
    const emailInput = document.querySelector('input[name="identifier"], input#identifierId, input[type="email"]');
    const passwordInput = document.querySelector('input[name="Passwd"], input[type="password"]:not([name="hiddenPassword"]):not([disabled])');
    const captcha = document.querySelector('img#captchaimg');
    const isGmail = window.location.hostname === 'mail.google.com';
    return emailInput || passwordInput || isGmail || (captcha && (captcha as HTMLElement).offsetWidth > 0);
  }, { timeout });
}

function isGmailUrl(url: string): boolean {
  try {
    return new URL(url).hostname === 'mail.google.com';
  } catch {
    return false;
  }
}

export async function getAuthenticatedGmailEmail(page: Page): Promise<string | null> {
  return page.evaluate((selector) => {
    const emailPattern = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    const candidates = Array.from(document.querySelectorAll(selector));

    for (const candidate of candidates) {
      const values = [
        candidate.getAttribute('data-email'),
        candidate.getAttribute('data-identifier'),
        candidate.getAttribute('aria-label'),
        candidate.getAttribute('title'),
        candidate.textContent
      ];

      for (const value of values) {
        const match = value?.match(emailPattern);
        if (match) return match[0].trim().toLowerCase();
      }
    }

    return null;
  }, ACCOUNT_IDENTITY_SELECTOR);
}

export async function assertAuthenticatedGmailAccount(
  page: Page,
  expectedEmail: string,
  timeout: number = 30000
): Promise<void> {
  const expected = expectedEmail.trim().toLowerCase();
  const deadline = Date.now() + timeout;

  while (Date.now() <= deadline) {
    const actual = await getAuthenticatedGmailEmail(page);
    if (actual) {
      if (actual !== expected) {
        throw new Error(
          `Authenticated Gmail account "${actual}" does not match configured account "${expected}". Refusing to continue.`
        );
      }
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Could not verify the authenticated Gmail account as "${expected}". Refusing to continue.`
  );
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

    await clickAccountChooserIfPresent(page, options.email, timeout);

    const needsEmail = await hasVisibleSelector(page, EMAIL_SELECTOR);

    if (needsEmail) {
      // 1. Enter Email
      await fillSignInInput(page, EMAIL_SELECTOR, options.email);
      await clickSignInNext(page, '#identifierNext');

      // Wait for password field OR captcha
      await page.waitForFunction(() => {
        const pwd = document.querySelector('input[name="Passwd"], input[type="password"]:not([name="hiddenPassword"]):not([disabled])');
        const captcha = document.querySelector('img#captchaimg');
        return pwd || (captcha && (captcha as HTMLElement).offsetWidth > 0);
      }, { timeout });

      const solvedEmailCaptcha = await solveCaptchaIfPresent(page, options.resolveCaptcha, '#identifierNext');
      if (solvedEmailCaptcha) {
        // Wait for password field to become active after captcha submission
        await page.waitForFunction(() => {
          const input = document.querySelector('input[name="Passwd"], input[type="password"]:not([name="hiddenPassword"])');
          return input && !input.hasAttribute('disabled');
        }, { timeout });
      }
    } else {
      await page.waitForFunction(() => {
        const isGmail = window.location.hostname === 'mail.google.com';
        const input = document.querySelector('input[name="Passwd"], input[type="password"]:not([name="hiddenPassword"])');
        const captcha = document.querySelector('img#captchaimg');
        return isGmail || (input && !input.hasAttribute('disabled')) || (captcha && (captcha as HTMLElement).offsetWidth > 0);
      }, { timeout });
    }

    if (isGmailUrl(page.url())) {
      await assertAuthenticatedGmailAccount(page, options.email, timeout);
      return page;
    }

    // 2. Enter Password
    await page.waitForSelector(PASSWORD_SELECTOR, { visible: true, timeout });
    await page.waitForFunction(() => {
      const input = document.querySelector('input[name="Passwd"], input[type="password"]:not([name="hiddenPassword"])');
      return input && !input.hasAttribute('disabled');
    }, { timeout });
    
    await fillSignInInput(page, PASSWORD_SELECTOR, options.password);
    await clickSignInNext(page, '#passwordNext');

    // Wait for success OR captcha
    await page.waitForFunction(() => {
      const isGmail = window.location.hostname === 'mail.google.com';
      const captcha = document.querySelector('img#captchaimg');
      const error = Array.from(document.querySelectorAll('[role="alert"], [aria-live="assertive"]'))
        .find((element) => {
          const htmlElement = element as HTMLElement;
          const message = (element.textContent || '').trim().toLowerCase();
          return message && message !== 'welcome' && htmlElement.offsetWidth > 0 && htmlElement.offsetHeight > 0;
        });
      return isGmail || error || (captcha && (captcha as HTMLElement).offsetWidth > 0);
    }, { timeout: 60000 });

    const signInError = await getSignInError(page);
    if (signInError) {
      throw new Error(`Google sign-in rejected the login attempt: ${signInError}`);
    }

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
  if (!isGmailUrl(page.url())) {
    throw new Error(`Failed to authenticate. Ended up at unexpected URL: ${page.url()}`);
  }

  if (options.email) {
    await assertAuthenticatedGmailAccount(page, options.email, timeout);
  }

  return page;
}
