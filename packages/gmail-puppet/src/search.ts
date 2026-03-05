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

  if (currentHash !== targetHash) {
    // Mark current rows as stale so we don't accidentally scrape them before Gmail clears them
    await page.evaluate(() => {
      document.querySelectorAll('tr.zA').forEach(el => el.setAttribute('data-stale', 'true'));
    });
    
    const targetUrl = `https://mail.google.com/mail/u/0/${targetHash}`;
    
    // Wait for network to settle after navigation (allows Gmail's background API calls to finish)
    const networkPromise = page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {});
    await page.goto(targetUrl);
    await networkPromise;

    // Wait an extra moment for React/Closure to render the new DOM nodes
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Wait for new rows to appear, but don't fail if they don't (empty inbox or 0 search results)
  try {
    await page.waitForSelector('tr.zA:not([data-stale="true"])', { timeout: 2000 });
  } catch (e) {
    // No new rows found. It's either empty, or the search returned 0 results.
  }

  // Extract metadata from the DOM. Strictly ignore stale rows.
  const emails = await page.$$eval('tr.zA:not([data-stale="true"])', (rows) => {
    return rows.map(row => {
      // Extract the internal Gmail ID (useful for direct navigation later)
      // The attributes are typically on a descendant span (e.g., span.bqe), not the row itself
      const idEl = row.querySelector('[data-legacy-message-id], [data-legacy-thread-id]');
      const id = idEl ? (idEl.getAttribute('data-legacy-message-id') || idEl.getAttribute('data-legacy-thread-id') || '') : '';

      // 'zE' class indicates unread, 'yO' indicates read
      const isUnread = row.classList.contains('zE');
      
      // Sender is usually in a span with an 'email' attribute, or just text
      const senderEl = row.querySelector('div.yW span[email], div.yW span');
      const sender = senderEl ? (senderEl.getAttribute('email') || senderEl.textContent || '').trim() : '';
      
      // Subject is typically inside a span with class 'bog'
      const subjectEl = row.querySelector('span.bog');
      const subject = subjectEl ? (subjectEl.textContent || '').trim() : '';
      
      // Snippet is typically inside a span with class 'y2'
      // Snippet often contains a leading dash (e.g., "- This is the message..."), clean it up
      const snippetEl = row.querySelector('span.y2');
      const snippet = snippetEl ? (snippetEl.textContent || '').replace(/^[-\s]+/, '').trim() : '';
      
      // Date is typically in the last column with class 'xW'
      const dateEl = row.querySelector('td.xW span');
      const date = dateEl ? (dateEl.getAttribute('title') || dateEl.textContent || '').trim() : '';

      return { id, sender, subject, snippet, date, isUnread };
    });
  });

  return emails;
}
