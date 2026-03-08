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
 * Clicks the "Mark as unread" button from within an open thread view
 * and waits for Gmail to navigate back to the list view.
 */
async function markCurrentThreadUnread(page: Page): Promise<void> {
  // act="2" is the stable action code for "Mark as unread" in the thread view toolbar.
  const unreadBtn = 'div[act="2"], div[aria-label="Mark as unread"], div[aria-label="Als ungelesen markieren"]';
  await page.waitForSelector(unreadBtn, { visible: true, timeout: 5000 });

  await page.evaluate((sel) => {
    const buttons = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
    const visibleButton = buttons.find(b => b.offsetWidth > 0 && b.offsetHeight > 0);
    if (visibleButton) visibleButton.click();
  }, unreadBtn);

  // When you mark a thread as unread from within the thread, Gmail automatically
  // navigates back to the list view. Waiting for the list rows (tr.zA) confirms the action completed.
  await page.waitForSelector('tr.zA', { timeout: 10000 });
}

/**
 * Reads an entire email thread and extracts all messages within it.
 * Assumes the page is already authenticated and navigated to the thread URL.
 *
 * @param page The authenticated Puppeteer Page.
 * @param options Options for reading the thread.
 * @returns A Promise resolving to an array of messages in the thread.
 */
export async function readThread(page: Page, options: ReadThreadOptions = {}): Promise<ThreadMessage[]> {
  const keepUnread = options.keepUnread ?? true;

  // Wait for the message body to load to ensure the thread is ready
  await page.waitForSelector('.a3s', { timeout: 15000 });

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
    await markCurrentThreadUnread(page);
  }

  return messages;
}

/**
 * Changes the read status of a specific thread.
 * Assumes the page is already authenticated and navigated to the thread URL.
 *
 * @param page The authenticated Puppeteer Page.
 * @param read True to mark as read, false to mark as unread.
 */
export async function setThreadReadStatus(page: Page, read: boolean): Promise<void> {
  // Wait for the thread to load
  await page.waitForSelector('.a3s', { timeout: 15000 });

  if (read) {
    // If the goal is to mark it as read, we are already done just by opening it.
    return;
  } else {
    // If the goal is to mark it as unread, we must explicitly click the button.
    await markCurrentThreadUnread(page);
  }
}
