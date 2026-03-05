import type { Page } from 'puppeteer';

export interface EmailMetadata {
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
  if (query) {
    const encodedQuery = encodeURIComponent(query);
    await page.goto(`https://mail.google.com/mail/u/0/#search/${encodedQuery}`, { waitUntil: 'networkidle2' });
  } else {
    await page.goto(`https://mail.google.com/mail/u/0/#inbox`, { waitUntil: 'networkidle2' });
  }

  // Wait up to 10 seconds for the email list to render.
  // 'tr.zA' is the standard class for an email row in Gmail.
  // If it times out, it will throw an error instead of returning an empty array.
  await page.waitForSelector('tr.zA', { timeout: 10000 });

  // Extract metadata from the DOM
  const emails = await page.$$eval('tr.zA', (rows) => {
    console.log(rows);
    return rows.map(row => {
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

      return { sender, subject, snippet, date, isUnread };
    });
  });

  return emails;
}
