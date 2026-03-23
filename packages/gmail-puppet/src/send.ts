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
    console.log(`[Gmail Send] Initiating reply flow for thread: ${options.replyToId}`);
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
    console.log(`[Gmail Send] Initiating new email flow to: ${options.to} via full-page compose`);
    if (!options.to || !options.subject) {
      throw new Error('The "to" and "subject" fields are required when sending a new email.');
    }

    // Wait for the "To" field inside the full-page compose view.
    // peoplekit-id is the modern Gmail identifier for recipient fields.
    // role="combobox" is a fallback for older/different rollouts.
    // These are locale-independent, fixing issues where aria-label="To" fails in non-English languages.
    const toSelector = 'input[peoplekit-id], input[name="to"], textarea[name="to"], input[role="combobox"][aria-autocomplete="list"]';
    await page.waitForSelector(toSelector, { visible: true, timeout: 15000 });
    
    // Type the recipient
    await page.type(toSelector, options.to, { delay: 50 });
    await page.keyboard.press('Enter');

    // Type the subject
    const subjectSelector = 'input[name="subjectbox"]';
    await page.waitForSelector(subjectSelector, { visible: true });
    await page.type(subjectSelector, options.subject, { delay: 50 });
  }

  // --- COMMON FLOW (Inject HTML and Send) ---
  console.log(`[Gmail Send] Waiting for email body textbox...`);
  
  // Wait for the message body. 
  // role="textbox" and contenteditable="true" is locale-independent and highly stable.
  const bodySelector = 'div[role="textbox"][contenteditable="true"]';
  await page.waitForSelector(bodySelector, { visible: true, timeout: 10000 });
  
  console.log(`[Gmail Send] Injecting HTML body...`);
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
  }, { timeout: 5000 }, bodySelector).catch(() => {
    console.warn(`[Gmail Send] WARNING: Timeout waiting for injected HTML to reflect in DOM.`);
  });

  console.log(`[Gmail Send] Looking for Send button...`);
  // Click Send using native Puppeteer click
  // .T-I-atl is the stable, long-standing class for the primary (blue) action button in Gmail.
  const sendButtonSelector = 'div[role="button"].T-I-atl';
  await page.waitForSelector(sendButtonSelector, { visible: true, timeout: 5000 });
  
  const sendButtons = await page.$$(sendButtonSelector);
  console.log(`[Gmail Send] Found ${sendButtons.length} potential Send buttons.`);
  
  let clickedSend = false;
  for (let i = 0; i < sendButtons.length; i++) {
    const btn = sendButtons[i];
    const isVisible = await btn.evaluate((b) => {
      const el = b as HTMLElement;
      return el.offsetWidth > 0 && el.offsetHeight > 0;
    });
    
    console.log(`[Gmail Send] Button ${i} visibility: ${isVisible}`);
    
    if (isVisible) {
      console.log(`[Gmail Send] Clicking Send button ${i}...`);
      await btn.click();
      clickedSend = true;
      break;
    }
  }

  if (!clickedSend) {
    console.warn(`[Gmail Send] ERROR: No visible Send button was found to click!`);
  }
  
  console.log(`[Gmail Send] Waiting for 'Message sent' toast...`);
  // Wait for the "Message sent" toast to ensure the background request completes successfully
  try {
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('span')).some(el => 
        el.textContent?.includes('Message sent') || 
        el.textContent?.includes('Nachricht gesendet')
      );
    }, { timeout: 10000 });
    console.log(`[Gmail Send] Send confirmation toast found.`);
  } catch (e) {
    throw new Error(`Failed to send email: 'Message sent' toast did not appear within timeout.`);
  }
}
