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
 * 
 * @param page The authenticated Puppeteer Page.
 * @param options Options containing the recipient, subject, HTML body, and optional reply ID.
 */
export async function sendEmail(page: Page, options: SendEmailOptions): Promise<void> {
  if (options.replyToId) {
    // --- REPLY FLOW ---
    // Navigate directly to the email thread using its ID
    await page.goto(`https://mail.google.com/mail/u/0/#inbox/${options.replyToId}`, { waitUntil: 'networkidle2' });
    
    // Wait for the email body to load to ensure the page is ready
    await page.waitForSelector('.a3s', { timeout: 10000 });

    // Click the Reply button. 
    // 'div[data-tooltip="Reply"]' is the reply arrow icon.
    // '.ams.bkH' is the "Reply" text button at the bottom of the thread.
    const replyButtonSelector = 'div[data-tooltip="Reply"], .ams.bkH';
    await page.waitForSelector(replyButtonSelector, { visible: true, timeout: 5000 });
    
    // Click the first visible reply button
    await page.evaluate((sel) => {
      const buttons = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
      const visibleButton = buttons.find(b => b.offsetWidth > 0 && b.offsetHeight > 0);
      if (visibleButton) visibleButton.click();
    }, replyButtonSelector);

  } else {
    // --- NEW EMAIL FLOW ---
    if (!options.to || !options.subject) {
      throw new Error('The "to" and "subject" fields are required when sending a new email.');
    }

    // Navigate to the compose window
    await page.goto('https://mail.google.com/mail/u/0/#inbox?compose=new', { waitUntil: 'networkidle2' });

    // Wait for the "To" field and type the recipient
    const toSelector = 'input[aria-label="To"], input[aria-label="To recipients"], input[name="to"]';
    await page.waitForSelector(toSelector, { visible: true, timeout: 10000 });
    await page.type(toSelector, options.to, { delay: 50 });
    await page.keyboard.press('Enter');

    // Type the subject
    const subjectSelector = 'input[name="subjectbox"]';
    await page.waitForSelector(subjectSelector, { visible: true });
    await page.type(subjectSelector, options.subject, { delay: 50 });
  }

  // --- COMMON FLOW (Inject HTML and Send) ---
  
  // Wait for the message body (contenteditable div)
  const bodySelector = 'div[aria-label="Message Body"]';
  await page.waitForSelector(bodySelector, { visible: true, timeout: 10000 });
  await page.click(bodySelector);

  // Inject HTML using execCommand. 
  // This simulates a rich-text paste, ensuring Gmail registers the input correctly.
  await page.evaluate((selector, html) => {
    const el = document.querySelector(selector) as HTMLElement;
    if (el) {
      el.focus();
      document.execCommand('insertHTML', false, html);
    }
  }, bodySelector, options.htmlBody);

  // Add a small delay to let Gmail process the injected HTML
  await new Promise(resolve => setTimeout(resolve, 500));

  // Click Send
  // The send button usually has an aria-label starting with "Send"
  const sendButtonSelector = 'div[aria-label^="Send"][role="button"]';
  await page.waitForSelector(sendButtonSelector, { visible: true, timeout: 5000 });
  await page.click(sendButtonSelector);

  // Wait for the send button to disappear, indicating the compose window closed and the email is sending
  try {
    await page.waitForFunction((sel) => !document.querySelector(sel), { timeout: 10000 }, sendButtonSelector);
  } catch (e) {
    // Ignore timeout, it might have closed very quickly
  }
  
  // Add a small buffer to ensure the background request completes
  await new Promise(resolve => setTimeout(resolve, 1000));
}
