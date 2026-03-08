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
   * The desired read status of the thread after reading.
   * If true, the thread will be marked/left as read.
   * If false, the thread will be marked as unread.
   * Defaults to false (mark as unread) to prevent accidental state changes.
   */
  setReadStatus?: boolean;
  /**
   * Indicates if the thread was unread before we opened it.
   * Used to optimize background sync waiting.
   */
  wasUnread?: boolean;
}

/**
 * Clicks the "Mark as unread" button from within an open thread view
 * and waits for Gmail to navigate back to the list view.
 */
async function markCurrentThreadUnread(page: Page): Promise<void> {
  // act="2" is the stable action code for "Mark as unread" in the thread view toolbar.
  const unreadBtn = 'div[act="2"], div[aria-label="Mark as unread"], div[aria-label="Als ungelesen markieren"]';
  await page.waitForSelector(unreadBtn, { visible: true, timeout: 5000 });

  // Use Puppeteer's native click to ensure trusted events (mousedown/mouseup) are fired,
  // which Gmail's SPA requires. DOM .click() often fails here.
  const buttons = await page.$$(unreadBtn);
  let clicked = false;
  for (const btn of buttons) {
    const isVisible = await btn.evaluate((b) => {
      const el = b as HTMLElement;
      return el.offsetWidth > 0 && el.offsetHeight > 0;
    });
    if (isVisible) {
      await btn.click();
      clicked = true;
      break;
    }
  }

  if (!clicked) {
    throw new Error('Could not find a visible "Mark as unread" button to click.');
  }

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
  const setReadStatus = options.setReadStatus ?? false;

  // Wait for the message body to load to ensure the thread is ready
  await page.waitForSelector('.a3s', { timeout: 15000 });

  // Expand all collapsed messages in the thread.
  // .kv is the stable Gmail class for a collapsed message header.
  const collapsedHeaders = await page.$$('div.kv');
  for (const header of collapsedHeaders) {
    const isVisible = await header.evaluate((b) => {
      const el = b as HTMLElement;
      return el.offsetWidth > 0 && el.offsetHeight > 0;
    });
    if (isVisible) {
      await header.click().catch(() => {});
    }
  }

  // Wait for the expansion animations to finish by checking if collapsed headers are gone or bodies are visible
  await page.waitForFunction(() => {
    const collapsed = document.querySelectorAll('div.kv');
    return collapsed.length === 0 || Array.from(collapsed).every(el => el.getBoundingClientRect().height === 0);
  }, { timeout: 5000 }).catch(() => {});

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

  if (setReadStatus === false) {
    // We want it to be unread. Opening it marked it as read, so we must explicitly mark it unread.
    await markCurrentThreadUnread(page);
  } else if (options.wasUnread === true) {
    // We want it to be read, and it WAS unread before.
    // Opening it changed the state to read. Wait for Gmail's background sync to register the new status.
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {});
  }
  // If setReadStatus === true AND wasUnread === false, it was already read.
  // Opening it changed nothing. We do absolutely nothing and return instantly!

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
    // Wait for Gmail's background sync to register the "read" status.
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {});
    return;
  } else {
    // If the goal is to mark it as unread, we must explicitly click the button.
    await markCurrentThreadUnread(page);
  }
}
