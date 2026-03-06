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
 * A stateful client for interacting with Gmail.
 * It queues operations sequentially to prevent concurrent navigations from clashing,
 * and opens a fresh Page for every action to guarantee a clean SPA state.
 */
export class GmailClient {
    private actionPromise: Promise<void> = Promise.resolve();

    constructor(private options: GmailClientOptions) {}

    /**
     * Enqueues an action to be executed sequentially.
     * For each action, it opens a new authenticated page, runs the action, and closes the page.
     */
    private enqueue<T>(action: (page: Page) => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const nextAction = this.actionPromise.then(async () => {
                let page: Page | null = null;
                try {
                    const browser = await this.options.getBrowser();
                    page = await ensureAuthenticatedGmail(browser, this.options);
                    const result = await action(page);
                    resolve(result);
                } catch (err) {
                    reject(err);
                } finally {
                    if (page) {
                        await page.close().catch(() => {});
                    }
                }
            });
            // Catch errors in the chain to prevent unhandled rejections from stopping the queue
            this.actionPromise = nextAction.catch(() => {});
        });
    }

    async searchEmails(query?: string, limit?: number): Promise<EmailMetadata[]> {
        return this.enqueue(page => searchEmails(page, query, limit));
    }

    async readThread(threadId: string): Promise<ThreadMessage[]> {
        return this.enqueue(page => readThread(page, threadId));
    }

    async sendEmail(options: SendEmailOptions): Promise<void> {
        return this.enqueue(page => sendEmail(page, options));
    }

    async close(): Promise<void> {
        // Wait for any pending actions in the queue to finish and close their pages
        await this.actionPromise;
    }
}

export function createGmailClient(options: GmailClientOptions): GmailClient {
    return new GmailClient(options);
}
