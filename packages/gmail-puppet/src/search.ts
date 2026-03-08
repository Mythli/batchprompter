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
 * Fetches a specific page of search results from Gmail.
 * Assumes the page is already authenticated and navigated to the correct search URL.
 * 
 * @param page The authenticated Puppeteer Page.
 * @returns A Promise resolving to an array of email metadata for that page.
 */
export async function searchEmailsOnPage(page: Page): Promise<EmailMetadata[]> {
  // Wait for new rows to appear, but don't fail if they don't (empty inbox or 0 search results)
  try {
    await page.waitForSelector('tr.zA', { timeout: 5000 });
  } catch (e) {
    // No new rows found. It's either empty, or we've reached the end of the pagination.
    return [];
  }

  // Extract metadata from the DOM.
  const emails = await page.$$eval('tr.zA', (rows) => {
    return rows.map(row => {
      // Extract the internal Gmail ID (useful for direct navigation later)
      // Prioritize thread-id over message-id to ensure thread navigation works correctly
      const idEl = row.querySelector('[data-legacy-thread-id], [data-legacy-message-id]');
      const id = idEl ? (idEl.getAttribute('data-legacy-thread-id') || idEl.getAttribute('data-legacy-message-id') || '') : '';

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

// Note: The searchEmails orchestration logic was moved to client.ts 
// because it needs to manage multiple pages and URLs.
