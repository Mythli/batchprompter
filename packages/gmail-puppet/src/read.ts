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

  console.log(`[readThread] Starting read process for threadId: "${threadId}"`);
  const targetUrl = `https://mail.google.com/mail/u/0/#all/${threadId}`;
  
  console.log(`[readThread] Navigating to: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'networkidle2' });
  
  const currentUrl = page.url();
  console.log(`[readThread] Navigation finished. Current URL is: ${currentUrl}`);

  if (!currentUrl.includes(threadId)) {
    console.warn(`[readThread] WARNING: Gmail redirected away from the thread! Expected ${threadId} in URL, but got ${currentUrl}`);
  }

  try {
    console.log(`[readThread] Waiting for message body (.a3s) to load...`);
    await page.waitForSelector('.a3s', { timeout: 10000 });
    console.log(`[readThread] Message body (.a3s) found successfully.`);
  } catch (error) {
    console.error(`[readThread] ERROR: Timed out waiting for .a3s.`);
    console.error(`[readThread] Final URL at timeout: ${page.url()}`);
    
    // Dump the page title and a snippet of the DOM to see what screen we are actually on
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        bodySnippet: document.body.innerText.substring(0, 500).replace(/\n/g, ' ')
      };
    });
    console.error(`[readThread] Page Title: "${pageInfo.title}"`);
    console.error(`[readThread] Page Text Snippet: "${pageInfo.bodySnippet}"`);
    
    throw error;
  }

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

  console.log(`[readThread] Successfully extracted ${messages.length} messages from thread.`);

  if (keepUnread) {
    console.log(`[readThread] keepUnread is true. Restoring unread status...`);
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
  console.log(`[setThreadReadStatus] Setting read status to ${read} for threadId: "${threadId}"`);
  // Navigate to search results for this specific thread
  const targetUrl = `https://mail.google.com/mail/u/0/#search/thread%3A${threadId}`;
  
  console.log(`[setThreadReadStatus] Navigating to: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'networkidle2' });

  // Gmail might auto-open the thread if there is exactly 1 search result, 
  // OR it might show the list view. We need to wait for either to appear.
  try {
    console.log(`[setThreadReadStatus] Waiting for list view (tr.zA) or thread view (.a3s)...`);
    await page.waitForSelector('tr.zA, .a3s', { timeout: 10000 });
  } catch (e) {
    console.error(`[setThreadReadStatus] ERROR: Could not find thread or list view. Current URL: ${page.url()}`);
    throw new Error(`Could not find thread ${threadId} or list view to change read status.`);
  }

  const isThreadView = await page.evaluate(() => !!document.querySelector('.a3s'));
  console.log(`[setThreadReadStatus] View detected: ${isThreadView ? 'Thread View' : 'List View'}`);

  if (isThreadView) {
    if (read) {
      console.log(`[setThreadReadStatus] Already in thread view, so it is marked as read.`);
      // If we are looking at the thread, it is already marked as read by Gmail.
      return;
    } else {
      console.log(`[setThreadReadStatus] Clicking 'Mark as unread' in thread view...`);
      // Mark as unread from within the thread view.
      // act="2" is the stable action code for "Mark as unread" in the thread view toolbar.
      const unreadBtn = 'div[act="2"], div[aria-label="Mark as unread"], div[aria-label="Als ungelesen markieren"]';
      await page.waitForSelector(unreadBtn, { visible: true, timeout: 5000 });
      
      await page.evaluate((sel) => {
        const buttons = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
        const visibleButton = buttons.find(b => b.offsetWidth > 0 && b.offsetHeight > 0);
        if (visibleButton) visibleButton.click();
      }, unreadBtn);

      await new Promise(resolve => setTimeout(resolve, 1000));
      return;
    }
  }

  // --- List View Logic ---
  const rowSelector = 'tr.zA';
  
  // Check current status (zE = unread, yO = read)
  const isCurrentlyUnread = await page.evaluate((sel) => {
    const row = document.querySelector(sel);
    return row ? row.classList.contains('zE') : false;
  }, rowSelector);

  const isCurrentlyRead = !isCurrentlyUnread;
  console.log(`[setThreadReadStatus] Current status in list view - Unread: ${isCurrentlyUnread}, Read: ${isCurrentlyRead}`);

  if ((read && isCurrentlyRead) || (!read && isCurrentlyUnread)) {
    console.log(`[setThreadReadStatus] Thread is already in the desired state.`);
    return; // Already in the desired state
  }

  console.log(`[setThreadReadStatus] Selecting thread checkbox...`);
  // Click the checkbox to select the thread
  const checkboxSelector = `${rowSelector} div[role="checkbox"]`;
  await page.click(checkboxSelector);

  // Wait for the toolbar to appear
  await new Promise(resolve => setTimeout(resolve, 500));

  // act="16" is Mark as unread, act="17" is Mark as read in the list view
  const buttonSelector = read 
    ? 'div[act="17"], div[aria-label="Mark as read"], div[aria-label="Als gelesen markieren"]' 
    : 'div[act="16"], div[aria-label="Mark as unread"], div[aria-label="Als ungelesen markieren"]';
  
  console.log(`[setThreadReadStatus] Clicking toolbar button...`);
  await page.waitForSelector(buttonSelector, { visible: true, timeout: 5000 });
  
  // Click the first visible button that matches
  await page.evaluate((sel) => {
    const buttons = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
    const visibleButton = buttons.find(b => b.offsetWidth > 0 && b.offsetHeight > 0);
    if (visibleButton) visibleButton.click();
  }, buttonSelector);

  // Wait a moment for the action to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log(`[setThreadReadStatus] Status change complete.`);
}
