import type { Page } from 'puppeteer';

export interface ThreadMessage {
  senderName: string;
  senderEmail: string;
  date: string;
  textBody: string;
  htmlBody: string;
}

/**
 * Navigates to a specific thread and ensures it is fully loaded.
 * This is a shared utility for reading threads.
 */
async function openThread(page: Page, threadId: string): Promise<void> {
  console.log(`[openThread] Navigating to threadId: "${threadId}"`);
  const targetUrl = `https://mail.google.com/mail/u/0/#all/${threadId}`;

  // Use domcontentloaded instead of networkidle2. Gmail has many persistent background 
  // connections that cause networkidle2 to frequently timeout.
  // Because we are using a fresh page per action, we don't need to force a reload anymore.
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

  const currentUrl = page.url();
  console.log(`[openThread] Navigation finished. Current URL is: ${currentUrl}`);

  if (!currentUrl.includes(threadId)) {
    console.warn(`[openThread] WARNING: Gmail redirected away from the thread! Expected ${threadId} in URL, but got ${currentUrl}`);
  }

  try {
    console.log(`[openThread] Waiting for message body (.a3s) to load...`);
    // We rely on the element appearing in the DOM as our true "ready" state, rather than network traffic.
    await page.waitForSelector('.a3s', { timeout: 15000 });
    console.log(`[openThread] Message body (.a3s) found successfully.`);
  } catch (error) {
    console.error(`[openThread] ERROR: Timed out waiting for .a3s.`);
    console.error(`[openThread] Final URL at timeout: ${page.url()}`);

    // Dump the page title and a snippet of the DOM to see what screen we are actually on
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        bodySnippet: document.body.innerText.substring(0, 500).replace(/\n/g, ' ')
      };
    });
    console.error(`[openThread] Page Title: "${pageInfo.title}"`);
    console.error(`[openThread] Page Text Snippet: "${pageInfo.bodySnippet}"`);

    throw new Error(`Could not open thread ${threadId}. See logs for details.`);
  }
}

/**
 * Reads an entire email thread and extracts all messages within it.
 *
 * @param page The authenticated Puppeteer Page.
 * @param threadId The internal Gmail ID of the thread to read.
 * @returns A Promise resolving to an array of messages in the thread.
 */
export async function readThread(page: Page, threadId: string): Promise<ThreadMessage[]> {
  console.log(`[readThread] Starting read process for threadId: "${threadId}"`);
  
  await openThread(page, threadId);

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

  return messages;
}
