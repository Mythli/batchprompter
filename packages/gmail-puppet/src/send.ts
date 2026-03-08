import type { Page } from 'puppeteer';

export interface SendEmailOptions {
  /**
   * The recipient's email address. Required if not replying.
   */
  to?: string;
  /**
   * The subject of the email. Required if not replying.
   */
  subject?: string;
  /**
   * The HTML content of the email body.
   */
  htmlBody: string;
  /**
   * If provided, the function will reply to the email thread with this ID 
   * instead of composing a new email.
   */
  replyToId?: string;
}

/**
 * Sends an HTML email or replies to an existing thread.
 * Assumes the page is already authenticated and navigated to the correct URL 
 * (either the inbox for a new email, or the specific thread for a reply).
 * 
 * @param page The authenticated Puppeteer Page.
 * @param options Options containing the recipient, subject, HTML body, and optional reply ID.
 */
export async function sendEmail(page: Page, options: SendEmailOptions): Promise<void> {
  // Bypass CSP to avoid TrustedHTML errors when injecting the email body via execCommand
  await page.setBypassCSP(true);

  if (options.replyToId) {
    // --- REPLY FLOW ---
    // Wait for the email body to load to ensure the thread is ready
    await page.waitForSelector('.a3s', { timeout: 15000 });

    // Click the Reply button. 
    // .ams.bkH is the "Reply" text button. .hB is the reply arrow icon.
    // These are locale-independent structural classes.
    const replyButtonSelector = '.ams.bkH, div[role="button"].hB';
    await page.waitForSelector(replyButtonSelector, { visible: true, timeout: 5000 });
    
    // Click the first visible reply button using native Puppeteer click
    const replyButtons = await page.$$(replyButtonSelector);
    for (const btn of replyButtons) {
      const isVisible = await btn.evaluate((b) => {
        const el = b as HTMLElement;
        return el.offsetWidth > 0 && el.offsetHeight > 0;
      });
      if (isVisible) {
        await btn.click();
        break;
      }
    }

  } else {
    // --- NEW EMAIL FLOW ---
    if (!options.to || !options.subject) {
      throw new Error('The "to" and "subject" fields are required when sending a new email.');
    }

    // Click the "Compose" button (T-I-KE is the specific class for the primary compose button)
    const composeButtonSelector = 'div[role="button"].T-I-KE';
    await page.waitForSelector(composeButtonSelector, { visible: true, timeout: 15000 });
    await page.click(composeButtonSelector);

    // Wait for the "To" field inside the compose dialog.
    // peoplekit-id is the modern Gmail identifier for recipient fields.
    // role="combobox" is a fallback for older/different rollouts.
    // These are locale-independent, fixing issues where aria-label="To" fails in non-English languages (like German "An").
    const toSelector = 'div[role="dialog"] input[peoplekit-id], div[role="dialog"] input[name="to"], div[role="dialog"] textarea[name="to"], div[role="dialog"] input[role="combobox"][aria-autocomplete="list"]';
    await page.waitForSelector(toSelector, { visible: true, timeout: 10000 });
    
    // Type the recipient
    await page.type(toSelector, options.to, { delay: 50 });
    await page.keyboard.press('Enter');

    // Type the subject
    const subjectSelector = 'div[role="dialog"] input[name="subjectbox"]';
    await page.waitForSelector(subjectSelector, { visible: true });
    await page.type(subjectSelector, options.subject, { delay: 50 });
  }

  // --- COMMON FLOW (Inject HTML and Send) ---
  
  // Wait for the message body. 
  // role="textbox" and contenteditable="true" is locale-independent and highly stable.
  const bodySelector = 'div[role="textbox"][contenteditable="true"]';
  await page.waitForSelector(bodySelector, { visible: true, timeout: 10000 });
  
  // Inject HTML using execCommand. 
  // We evaluate to find the visible one, as there might be hidden drafts in the DOM.
  await page.evaluate((selector, html) => {
    const boxes = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    const visibleBox = boxes.find(b => b.offsetWidth > 0 && b.offsetHeight > 0);
    if (visibleBox) {
      visibleBox.focus();
      try {
        // This might fail if CSP TrustedTypes is enforced and setBypassCSP didn't catch it
        document.execCommand('insertHTML', false, html);
      } catch (err) {
        // Fallback: Simulate a rich-text paste event. 
        // Gmail's internal event listeners will catch this, sanitize it via their own TrustedTypes policy, and insert it.
        const dt = new DataTransfer();
        dt.setData('text/html', html);
        dt.setData('text/plain', html);
        visibleBox.dispatchEvent(new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true
        }));
      }
    }
  }, bodySelector, options.htmlBody);

  // Wait for the injected HTML to be reflected in the DOM
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return el && el.innerHTML.length > 0;
  }, { timeout: 5000 }, bodySelector).catch(() => {});

  // Click Send using native Puppeteer click
  // .T-I-atl is the stable, long-standing class for the primary (blue) action button in Gmail.
  const sendButtonSelector = 'div[role="button"].T-I-atl';
  await page.waitForSelector(sendButtonSelector, { visible: true, timeout: 5000 });
  
  const sendButtons = await page.$$(sendButtonSelector);
  for (const btn of sendButtons) {
    const isVisible = await btn.evaluate((b) => {
      const el = b as HTMLElement;
      return el.offsetWidth > 0 && el.offsetHeight > 0;
    });
    if (isVisible) {
      await btn.click();
      break;
    }
  }

  // Wait for the send button to disappear, indicating the compose window closed and the email is sending
  try {
    await page.waitForFunction((sel) => {
      const buttons = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
      const visibleButton = buttons.find(b => b.offsetWidth > 0 && b.offsetHeight > 0);
      return !visibleButton;
    }, { timeout: 10000 }, sendButtonSelector);
  } catch (e) {
    // Ignore timeout, it might have closed very quickly
  }
  
  // Wait for the "Message sent" toast or network idle to ensure the background request completes
  await Promise.race([
    page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('span')).some(el => el.textContent?.includes('Message sent'));
    }, { timeout: 5000 }),
    page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 })
  ]).catch(() => {});
}
