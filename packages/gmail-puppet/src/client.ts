import type { Browser, Page } from 'puppeteer';
import { ensureAuthenticatedGmail, GmailAuthOptions } from './auth.js';
import { searchEmails, EmailMetadata } from './search.js';
import { readThread, ThreadMessage } from './read.js';
import { sendEmail, SendEmailOptions } from './send.js';

export interface GmailClientOptions extends GmailAuthOptions {
    /**
     * A function that returns a Promise resolving to a Puppeteer Browser instance.
     */
    getBrowser: () => Promise<Browser>;
}

/**
 * A stateless client for interacting with Gmail.
 * For every action, it opens a new authenticated page, runs the action, and closes the page.
 * This guarantees a clean SPA state and allows concurrent operations.
 */
export class GmailClient {
    constructor(private options: GmailClientOptions) {}

    /**
     * Executes an action within a fresh, authenticated Gmail page.
     * The page is automatically closed when the action completes or fails.
     */
    private async withPage<T>(action: (page: Page) => Promise<T>): Promise<T> {
        let page: Page | null = null;
        try {
            const browser = await this.options.getBrowser();
            page = await ensureAuthenticatedGmail(browser, this.options);
            return await action(page);
        } finally {
            if (page) {
                await page.close().catch(() => {});
            }
        }
    }

    async searchEmails(query?: string, limit?: number): Promise<EmailMetadata[]> {
        return this.withPage(page => searchEmails(page, query, limit));
    }

    async readThread(threadId: string): Promise<ThreadMessage[]> {
        return this.withPage(page => readThread(page, threadId));
    }

    async sendEmail(options: SendEmailOptions): Promise<void> {
        return this.withPage(page => sendEmail(page, options));
    }

    async close(): Promise<void> {
        // The client is now stateless and manages page lifecycles per-action.
        // There are no persistent resources to clean up here.
    }
}

export function createGmailClient(options: GmailClientOptions): GmailClient {
    return new GmailClient(options);
}
