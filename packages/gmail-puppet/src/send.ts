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
 * The Send button was clicked, but Gmail did not expose a definitive success
 * signal. Retrying the whole action could send the same message twice, so the
 * client must surface this state to the caller without another send attempt.
 */
export class GmailSendUnconfirmedError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'GmailSendUnconfirmedError';
  }
}

async function pasteHtmlIntoVisibleBody(page: Page, selector: string, html: string): Promise<'clipboard' | 'keyboard-clipboard' | 'fallback'> {
  // A native rich-text paste is important for inline data images. Gmail turns
  // them into real embedded message images; direct DOM insertion leaves a data
  // URL that Gmail may silently refuse to send.
  const clipboardReady = await page.browserContext()
    .overridePermissions('https://mail.google.com', ['clipboard-read', 'clipboard-write'])
    .then(() => true)
    .catch(() => false);

  if (clipboardReady) {
    await page.bringToFront();
    const clipboardResult = await page.evaluate(async (bodySelector, bodyHtml) => {
      const boxes = Array.from(document.querySelectorAll(bodySelector)) as HTMLElement[];
      const visibleBox = boxes.find(box => box.offsetWidth > 0 && box.offsetHeight > 0);
      if (!visibleBox) {
        return { copied: false, reason: 'no_visible_body' };
      }
      if (!navigator.clipboard) {
        return { copied: false, reason: 'clipboard_api_unavailable' };
      }
      if (typeof ClipboardItem === 'undefined') {
        return { copied: false, reason: 'clipboard_item_unavailable' };
      }

      const plainText = bodyHtml
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/p\s*>/gi, '\n\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');

      try {
        visibleBox.focus();
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([bodyHtml], { type: 'text/html' }),
            'text/plain': new Blob([plainText], { type: 'text/plain' })
          })
        ]);
        return { copied: true, reason: '' };
      } catch (error) {
        return {
          copied: false,
          reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        };
      }
    }, selector, html);

    if (clipboardResult.copied) {
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await page.keyboard.down(modifier);
      await page.keyboard.press('V');
      await page.keyboard.up(modifier);
      return 'clipboard';
    }

    console.warn(`[Gmail Send] Native clipboard insertion unavailable: ${clipboardResult.reason}`);
  }

  // Chromium can deny navigator.clipboard.write() in automation even after the
  // permission is granted. Insert once as a temporary source, then use real
  // keyboard copy/paste inside the active Gmail editor. The final editor change
  // therefore follows Gmail's trusted rich-text paste path.
  const fallbackInserted = await page.evaluate((bodySelector, bodyHtml) => {
    const boxes = Array.from(document.querySelectorAll(bodySelector)) as HTMLElement[];
    const visibleBox = boxes.find(box => box.offsetWidth > 0 && box.offsetHeight > 0);
    if (!visibleBox) return false;

    visibleBox.focus();
    try {
      document.execCommand('insertHTML', false, bodyHtml);
    } catch {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/html', bodyHtml);
      dataTransfer.setData('text/plain', bodyHtml);
      visibleBox.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true
      }));
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(visibleBox);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return visibleBox.innerHTML.length > 0;
  }, selector, html);

  if (fallbackInserted) {
    if (/data:image\/[a-z0-9.+-]+;base64,/i.test(html)) {
      await page.waitForFunction((bodySelector) => {
        const boxes = Array.from(document.querySelectorAll(bodySelector)) as HTMLElement[];
        const visibleBox = boxes.find(box => box.offsetWidth > 0 && box.offsetHeight > 0);
        if (!visibleBox) return false;

        const images = Array.from(visibleBox.querySelectorAll('img'));
        return images.length > 0 && images.every(image => {
          const src = image.getAttribute('src') || '';
          const embeddedId = image.getAttribute('data-surl') || '';
          return src.length > 0 &&
            !src.startsWith('data:') &&
            image.complete &&
            image.naturalWidth > 0 &&
            embeddedId.startsWith('cid:');
        });
      }, { timeout: 30000 }, selector);
    }

    await page.evaluate((bodySelector) => {
      const boxes = Array.from(document.querySelectorAll(bodySelector)) as HTMLElement[];
      const visibleBox = boxes.find(box => box.offsetWidth > 0 && box.offsetHeight > 0);
      if (!visibleBox) return;

      visibleBox.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(visibleBox);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }, selector);

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.down(modifier);
    await page.keyboard.press('C');
    await page.keyboard.up(modifier);

    await page.evaluate((bodySelector) => {
      const boxes = Array.from(document.querySelectorAll(bodySelector)) as HTMLElement[];
      const visibleBox = boxes.find(box => box.offsetWidth > 0 && box.offsetHeight > 0);
      visibleBox?.focus();
    }, selector);
    await page.keyboard.down(modifier);
    await page.keyboard.press('A');
    await page.keyboard.up(modifier);
    await page.keyboard.press('Backspace');

    await page.keyboard.down(modifier);
    await page.keyboard.press('V');
    await page.keyboard.up(modifier);
    return 'keyboard-clipboard';
  }

  throw new Error('Gmail Send: Unable to insert the HTML body into the active editor.');
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
    const replyButtonSelector = '.ams.bkH, button.DILLkc, div[role="button"].hB';
    await page.waitForSelector(replyButtonSelector, { visible: true, timeout: 15000 });
    
    // Reply to the newest visible message in the thread. Gmail renders older
    // message reply controls first in DOM order.
    const replyButtons = await page.$$(replyButtonSelector);
    const visibleReplyButtons = [];
    for (const btn of replyButtons) {
      const isVisible = await btn.evaluate((b) => {
        const el = b as HTMLElement;
        return el.offsetWidth > 0 && el.offsetHeight > 0;
      });
      if (isVisible) {
        visibleReplyButtons.push(btn);
      }
    }

    const newestReplyButton = visibleReplyButtons.at(-1);
    if (!newestReplyButton) {
      throw new Error('Gmail Send: No visible reply button was found.');
    }
    await newestReplyButton.click();

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
  // Gmail occasionally needs longer than ten seconds to mount the reply editor,
  // especially for older threads with inline media. A short timeout incorrectly
  // classified an unopened editor as a failed send even though the thread page
  // itself was healthy. Keep this wait before body insertion, so extending it
  // cannot create an ambiguous post-send retry.
  await page.waitForSelector(bodySelector, { visible: true, timeout: 30000 });
  
  console.log(`[Gmail Send] Injecting HTML body...`);
  const insertionMethod = await pasteHtmlIntoVisibleBody(page, bodySelector, options.htmlBody);
  console.log(`[Gmail Send] HTML body inserted via ${insertionMethod}.`);

  // Wait for the injected HTML to be reflected in the DOM
  await page.waitForFunction((sel) => {
    const boxes = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
    const visibleBox = boxes.find(box => box.offsetWidth > 0 && box.offsetHeight > 0);
    return visibleBox && visibleBox.innerHTML.length > 0;
  }, { timeout: 5000 }, bodySelector).catch(() => {
    console.warn(`[Gmail Send] WARNING: Timeout waiting for injected HTML to reflect in DOM.`);
  });

  if (/data:image\/[a-z0-9.+-]+;base64,/i.test(options.htmlBody)) {
    console.log(`[Gmail Send] Waiting for Gmail to embed inline data image(s)...`);
    await page.waitForFunction((sel) => {
      const boxes = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
      const visibleBox = boxes.find(box => box.offsetWidth > 0 && box.offsetHeight > 0);
      if (!visibleBox) return false;

      const images = Array.from(visibleBox.querySelectorAll('img'));
      return images.length > 0 && images.every(image => {
        const src = image.getAttribute('src') || '';
        const embeddedId = image.getAttribute('data-surl') || '';
        return src.length > 0 &&
          !src.startsWith('data:') &&
          image.complete &&
          image.naturalWidth > 0 &&
          embeddedId.startsWith('cid:');
      });
    }, { timeout: 30000 }, bodySelector);
    console.log(`[Gmail Send] Inline data image(s) converted to embedded Gmail image(s).`);
  }

  console.log(`[Gmail Send] Looking for Send button...`);
  // Click Send using native Puppeteer click
  // .T-I-atl is the stable, long-standing class for the primary (blue) action button in Gmail.
  const sendButtonSelector = 'div[role="button"].T-I-atl';
  await page.waitForSelector(sendButtonSelector, { visible: true, timeout: 5000 });
  
  const sendButtons = await page.$$(sendButtonSelector);
  console.log(`[Gmail Send] Found ${sendButtons.length} potential Send buttons.`);
  
  const activeSendButtons = [];
  for (let i = 0; i < sendButtons.length; i++) {
    const btn = sendButtons[i];
    const state = await btn.evaluate((b, composeBodySelector) => {
      const el = b as HTMLElement;
      const boxes = Array.from(document.querySelectorAll(composeBodySelector)) as HTMLElement[];
      const visibleBox = boxes.find(box => box.offsetWidth > 0 && box.offsetHeight > 0);
      const composeRegion = visibleBox?.closest('[role="region"]');
      return {
        visible: el.offsetWidth > 0 && el.offsetHeight > 0,
        hasLabelText: (el.textContent || '').trim().length > 0,
        belongsToActiveComposer: composeRegion ? composeRegion.contains(el) : true
      };
    }, bodySelector);
    
    console.log(`[Gmail Send] Button ${i} state: ${JSON.stringify(state)}`);
    
    if (state.visible && state.hasLabelText && state.belongsToActiveComposer) {
      activeSendButtons.push({ btn, index: i });
    }
  }

  const selectedSendButton = activeSendButtons.at(0);

  if (!selectedSendButton) {
    throw new Error('Gmail Send: No visible Send button was found to click.');
  }

  // Gmail's reply composer can ignore an automated pointer click even though
  // Puppeteer reports it as successful. Focus plus Enter produces a trusted
  // keyboard activation on the already validated primary Send control.
  // Only one activation is attempted; if confirmation is absent, the caller
  // receives a non-retryable error to avoid duplicate messages.
  console.log(`[Gmail Send] Activating Send button ${selectedSendButton.index} via keyboard...`);
  await selectedSendButton.btn.focus();
  await page.keyboard.press('Enter');
  
  console.log(`[Gmail Send] Waiting for 'Message sent' toast...`);
  // Wait for the "Message sent" toast to ensure the background request completes successfully
  try {
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('span')).some(el => 
        el.textContent?.includes('Message sent') || 
        el.textContent?.includes('Nachricht gesendet')
      );
    }, { timeout: 30000 });
    console.log(`[Gmail Send] Send confirmation toast found.`);
  } catch (e) {
    const failureState = await page.evaluate((composeBodySelector) => {
      const visibleText = (element: Element) => {
        const htmlElement = element as HTMLElement;
        return htmlElement.offsetWidth > 0 && htmlElement.offsetHeight > 0;
      };
      const boxes = Array.from(document.querySelectorAll(composeBodySelector)) as HTMLElement[];
      const visibleBox = boxes.find(box => box.offsetWidth > 0 && box.offsetHeight > 0);
      const images = visibleBox ? Array.from(visibleBox.querySelectorAll('img')) : [];

      return {
        url: location.href,
        alerts: Array.from(document.querySelectorAll('[role="alert"], [role="dialog"]'))
          .filter(visibleText)
          .map(element => (element.textContent || '').trim().slice(0, 500))
          .filter(Boolean)
          .slice(0, 10),
        composeStillVisible: Boolean(visibleBox),
        imageStates: images.map(image => ({
          src: (image.getAttribute('src') || '').slice(0, 80),
          embeddedId: image.getAttribute('data-surl') || '',
          complete: image.complete,
          naturalWidth: image.naturalWidth
        }))
      };
    }, bodySelector).catch(error => ({ diagnosticError: String(error) }));
    console.error(`[Gmail Send] Unconfirmed send state: ${JSON.stringify(failureState)}`);
    throw new GmailSendUnconfirmedError(`Failed to confirm email send after clicking Send: 'Message sent' toast did not appear within timeout.`);
  }
}
