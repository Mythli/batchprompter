import type { Page } from 'puppeteer';

export interface EmailMetadata {
  id: string;
  sender: string;
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
}

/**
 * Searches Gmail and extracts metadata from the resulting email list.
 * If no query is provided, it defaults to the inbox view.
 * 
 * @param page The authenticated Puppeteer Page.
 * @param query Optional search query (e.g., "in:inbox", "from:boss@example.com").
 * @returns A Promise resolving to an array of email metadata.
 */
export async function searchEmails(page: Page, query?: string): Promise<EmailMetadata[]> {
  const targetHash = query ? `#search/${encodeURIComponent(query)}` : `#inbox`;
  const currentUrl = page.url();
  const currentHash = currentUrl.includes('#') ? currentUrl.substring(currentUrl.indexOf('#')) : '';

  // Only wait for DOM detachment if we are actually changing views
  if (currentHash !== targetHash) {
    // Grab a reference to the current first row before we navigate
    const oldRow = await page.$('tr.zA').catch(() => null);
    
    const targetUrl = `https://mail.google.com/mail/u/0/${targetHash}`;
    await page.goto(targetUrl);

    // If there was an old row, wait for Gmail to remove it from the DOM.
    // This prevents the race condition where we accidentally scrape the old view
    // just before Gmail clears it to show the loading state or new results.
    if (oldRow) {
      try {
        await page.waitForFunction((el) => !document.body.contains(el), { timeout: 10000 }, oldRow);
      } catch (e) {
        // Ignore timeout, just in case the view didn't actually need to change
      }
    }
  }

  // Wait for the new email rows to render.
  try {
    await page.waitForSelector('tr.zA', { timeout: 10000 });
  } catch (e) {
    // If it times out, there are likely no emails matching the search
    return [];
  }

  // Add a small delay to allow all rows to finish rendering completely
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Extract metadata from the DOM
  const emails = await page.$$eval('tr.zA', (rows) => {
    return rows.map(row => {
      // Extract the internal Gmail ID (useful for direct navigation later)
      const id = row.getAttribute('data-legacy-message-id') || row.getAttribute('data-legacy-thread-id') || '';

      // 'zE' class indicates unread, 'yO' indicates read
      const isUnread = row.classList.contains('zE');
      
      // Sender is usually in a span with an 'email' attribute, or just text
      const senderEl = row.querySelector('div.yW span[email], div.yW span');
      const sender = senderEl ? (senderEl.getAttribute('email') || senderEl.textContent || '').trim() : '';
      
      // Subject is typically inside a span with class 'bog'
      const subjectEl = row.querySelector('span.bog');
      const subject = subjectEl ? (subjectEl.textContent || '').trim() : '';
      
      // Snippet is typically inside a span with class 'y2'
      const snippetEl = row.querySelector('span.y2');
      // Snippet often contains a leading dash (e.g., "- This is the message..."), clean it up
      const snippet = snippetEl ? (snippetEl.textContent || '').replace(/^[-\s]+/, '').trim() : '';
      
      // Date is typically in the last column with class 'xW'
      const dateEl = row.querySelector('td.xW span');
      const date = dateEl ? (dateEl.getAttribute('title') || dateEl.textContent || '').trim() : '';

      return { id, sender, subject, snippet, date, isUnread };
    });
  });

  return emails;
}
