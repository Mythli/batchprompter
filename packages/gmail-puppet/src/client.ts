import type { Browser, Page } from 'puppeteer';
import { ensureAuthenticatedGmail, GmailAuthOptions } from './auth.js';
import { searchEmails, EmailMetadata } from './search.js';
import { readThread, ThreadMessage } from './read.js';
import { sendEmail, SendEmailOptions } from './send.js';

export interface GmailClientOptions extends GmailAuthOptions {
    /**
     * A function that returns a Promise resolving to a Puppeteer Browser instance.
     * This allows the client to lazily request the browser only when needed.
     */
    getBrowser: () => Promise<Browser>;
}

/**
 * A stateful client for interacting with Gmail.
 * It manages a single authenticated Puppeteer Page and queues operations
 * sequentially to prevent concurrent navigations from clashing.
 */
export class GmailClient {
    private pagePromise: Promise<Page> | null = null;
    private actionPromise: Promise<void> = Promise.resolve();

    constructor(private options: GmailClientOptions) {}

    private async getPage(): Promise<Page> {
        if (!this.pagePromise) {
            this.pagePromise = this.options.getBrowser().then(browser => 
                ensureAuthenticatedGmail(browser, this.options)
            );
        }
        return this.pagePromise;
    }

    /**
     * Enqueues an action to be executed sequentially on the shared page.
     * If an action fails, the page is closed to ensure a clean state for the next action.
     */
    private enqueue<T>(action: (page: Page) => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const nextAction = this.actionPromise.then(async () => {
                try {
                    const page = await this.getPage();
                    const result = await action(page);
                    resolve(result);
                } catch (err) {
                    await this.close(); // Reset page state on error
                    reject(err);
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
        if (this.pagePromise) {
            const page = await this.pagePromise.catch(() => null);
            if (page) {
                await page.close().catch(() => {});
            }
            this.pagePromise = null;
        }
    }
}

export function createGmailClient(options: GmailClientOptions): GmailClient {
    return new GmailClient(options);
}
