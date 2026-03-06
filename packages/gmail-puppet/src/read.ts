import type { Page } from 'puppeteer';

export interface ThreadMessage {
  senderName: string;
  senderEmail: string;
  date: string;
  textBody: string;
  htmlBody: string;
}

export interface ReadThreadOptions {
  /**
   * If true, the thread will be marked as unread after reading it.
   * Defaults to true.
   */
  keepUnread?: boolean;
}

/**
 * Reads an entire email thread and extracts all messages within it.
 * 
 * @param page The authenticated Puppeteer Page.
 * @param threadId The internal Gmail ID of the thread to read.
 * @param options Options for reading the thread.
 * @returns A Promise resolving to an array of messages in the thread.
 */
export async function readThread(page: Page, threadId: string, options: ReadThreadOptions = {}): Promise<ThreadMessage[]> {
  const keepUnread = options.keepUnread ?? true;

  // Navigate directly to the thread
  await page.goto(`https://mail.google.com/mail/u/0/#inbox/${threadId}`, { waitUntil: 'networkidle2' });

  // Wait for at least one message body to load to ensure the thread is ready
  await page.waitForSelector('.a3s', { timeout: 10000 });

  // Expand all collapsed messages in the thread.
  // .kv is the stable Gmail class for a collapsed message header.
  await page.evaluate(() => {
    const collapsedHeaders = document.querySelectorAll('div.kv');
    collapsedHeaders.forEach(header => (header as HTMLElement).click());
  });

  // Wait a moment for the expansion animations to finish and the DOM to update
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Extract data from all message blocks
  // .adn is the stable Gmail class for a single message container within a thread
  const messages = await page.$$eval('div.adn', (messageBlocks) => {
    return messageBlocks.map(block => {
      // Sender info is typically in span.gD
      const senderEl = block.querySelector('span.gD');
      const senderName = senderEl ? (senderEl.textContent || '').trim() : '';
      const senderEmail = senderEl ? (senderEl.getAttribute('email') || '').trim() : '';

      // Date is typically in span.g3
      const dateEl = block.querySelector('span.g3');
      const date = dateEl ? (dateEl.getAttribute('title') || dateEl.textContent || '').trim() : '';

      // The actual email body is in div.a3s
      const bodyEl = block.querySelector('div.a3s');
      const textBody = bodyEl ? (bodyEl as HTMLElement).innerText.trim() : '';
      const htmlBody = bodyEl ? bodyEl.innerHTML.trim() : '';

      return { senderName, senderEmail, date, textBody, htmlBody };
    }).filter(msg => msg.htmlBody !== ''); // Filter out any empty blocks that might have been caught
  });

  if (keepUnread) {
    // Reading a thread automatically marks it as read in Gmail.
    // If keepUnread is true, we explicitly mark it as unread before returning.
    await setThreadReadStatus(page, threadId, false);
  }

  return messages;
}

/**
 * Changes the read status of a specific thread.
 * 
 * @param page The authenticated Puppeteer Page.
 * @param threadId The internal Gmail ID of the thread.
 * @param read True to mark as read, false to mark as unread.
 */
export async function setThreadReadStatus(page: Page, threadId: string, read: boolean): Promise<void> {
  // Navigate to search results for this specific thread
  await page.goto(`https://mail.google.com/mail/u/0/#search/thread%3A${threadId}`, { waitUntil: 'networkidle2' });

  const rowSelector = 'tr.zA';
  try {
    await page.waitForSelector(rowSelector, { timeout: 5000 });
  } catch (e) {
    throw new Error(`Could not find thread ${threadId} to change read status.`);
  }

  // Check current status (zE = unread, yO = read)
  const isCurrentlyUnread = await page.evaluate((sel) => {
    const row = document.querySelector(sel);
    return row ? row.classList.contains('zE') : false;
  }, rowSelector);

  const isCurrentlyRead = !isCurrentlyUnread;

  if ((read && isCurrentlyRead) || (!read && isCurrentlyUnread)) {
    return; // Already in the desired state
  }

  // Click the checkbox to select the thread
  const checkboxSelector = `${rowSelector} div[role="checkbox"]`;
  await page.click(checkboxSelector);

  // Wait for the toolbar to appear
  await new Promise(resolve => setTimeout(resolve, 500));

  // act="16" is Mark as unread, act="17" is Mark as read
  // We also include aria-label and data-tooltip as robust fallbacks
  const buttonSelector = read 
    ? 'div[act="17"], div[aria-label="Mark as read"], div[data-tooltip="Mark as read"]' 
    : 'div[act="16"], div[aria-label="Mark as unread"], div[data-tooltip="Mark as unread"]';
  
  await page.waitForSelector(buttonSelector, { visible: true, timeout: 5000 });
  
  // Click the first visible button that matches
  await page.evaluate((sel) => {
    const buttons = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
    const visibleButton = buttons.find(b => b.offsetWidth > 0 && b.offsetHeight > 0);
    if (visibleButton) visibleButton.click();
  }, buttonSelector);

  // Wait a moment for the action to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
}
