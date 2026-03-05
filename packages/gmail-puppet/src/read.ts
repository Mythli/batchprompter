import type { Page } from 'puppeteer';

export interface ThreadMessage {
  senderName: string;
  senderEmail: string;
  date: string;
  textBody: string;
  htmlBody: string;
}

/**
 * Reads an entire email thread and extracts all messages within it.
 * 
 * @param page The authenticated Puppeteer Page.
 * @param threadId The internal Gmail ID of the thread to read.
 * @returns A Promise resolving to an array of messages in the thread.
 */
export async function readThread(page: Page, threadId: string): Promise<ThreadMessage[]> {
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

  return messages;
}
