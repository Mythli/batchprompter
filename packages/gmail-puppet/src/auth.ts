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

const IDENTIFIER_INPUT_SELECTORS = [
  '#identifierId',
  'input[type="email"]',
  'input[name="identifier"]',
] as const;

async function hasVisibleSelector(page: Page, selector: string): Promise<boolean> {
  const element = await page.$(selector);
  if (!element) return false;

  return element.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && (el as HTMLElement).offsetWidth > 0;
  }).catch(() => false);
}

async function findVisibleIdentifierSelector(page: Page): Promise<string | null> {
  for (const selector of IDENTIFIER_INPUT_SELECTORS) {
    if (await hasVisibleSelector(page, selector)) {
      return selector;
    }
  }
  return null;
}

async function hasVisibleIdentifierInput(page: Page): Promise<boolean> {
  return (await findVisibleIdentifierSelector(page)) !== null;
}

async function clickAccountChooserIfPresent(page: Page, email: string, timeout: number): Promise<void> {
  const isAccountsPage = page.url().includes('accounts.google.com');
  if (!isAccountsPage) return;

  if (await hasVisibleIdentifierInput(page)) {
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
    const identifierInput = document.querySelector('#identifierId')
      || document.querySelector('input[type="email"]')
      || document.querySelector('input[name="identifier"]');
    const passwordInput = document.querySelector('input[type="password"]:not([disabled])');
    const captcha = document.querySelector('img#captchaimg');
    const isGmail = window.location.hostname === 'mail.google.com';
    return identifierInput || passwordInput || isGmail || (captcha && (captcha as HTMLElement).offsetWidth > 0);
  }, { timeout });
}

function isGmailUrl(url: string): boolean {
  try {
    return new URL(url).hostname === 'mail.google.com';
  } catch {
    return false;
  }
}

async function submitIdentifierIfNeeded(
	page: Page,
	email: string,
	timeout: number,
	resolveCaptcha?: (base64Image: string) => Promise<string>,
): Promise<void> {
	const identifierSelector = await findVisibleIdentifierSelector(page);
	if (!identifierSelector) {
		return;
	}

	await page.waitForSelector(identifierSelector, { visible: true, timeout });
	await page.type(identifierSelector, email, { delay: 50 });
	await page.click('#identifierNext');

	await page.waitForFunction(
		() => {
			const pwd = document.querySelector(
				'input[type="password"]:not([disabled])',
			);
			const captcha = document.querySelector('img#captchaimg');
			return pwd || (captcha && (captcha as HTMLElement).offsetWidth > 0);
		},
		{ timeout },
	);

	const solvedEmailCaptcha = await solveCaptchaIfPresent(
		page,
		resolveCaptcha,
		'#identifierNext',
	);
	if (solvedEmailCaptcha) {
		await page.waitForFunction(
			() => {
				const input = document.querySelector('input[type="password"]');
				return input && !input.hasAttribute('disabled');
			},
			{ timeout },
		);
	}
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

    await page.waitForFunction(() => {
      const identifierInput = document.querySelector('#identifierId')
        || document.querySelector('input[type="email"]')
        || document.querySelector('input[name="identifier"]');
      const isGmail = window.location.hostname === 'mail.google.com';
      const input = document.querySelector('input[type="password"]');
      const captcha = document.querySelector('img#captchaimg');
      return isGmail
        || identifierInput
        || (input && !input.hasAttribute('disabled'))
        || (captcha && (captcha as HTMLElement).offsetWidth > 0);
    }, { timeout });

    if (isGmailUrl(page.url())) {
      return page;
    }

    await submitIdentifierIfNeeded(page, options.email, timeout, options.resolveCaptcha);

    if (isGmailUrl(page.url())) {
      return page;
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
  if (!isGmailUrl(page.url())) {
    throw new Error(`Failed to authenticate. Ended up at unexpected URL: ${page.url()}`);
  }

  return page;
}
