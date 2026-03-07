import type { Page } from 'puppeteer';
import { ensureAuthenticatedGmail, GmailAuthOptions } from './auth.js';
import { searchEmails, EmailMetadata } from './search.js';
import { readThread, ThreadMessage } from './read.js';
import { sendEmail, SendEmailOptions } from './send.js';

export interface GmailClientOptions extends GmailAuthOptions {
    /**
     * A function that provides a Puppeteer Page, manages its lifecycle, and handles concurrency.
     */
    usePage: <T>(action: (page: Page) => Promise<T>) => Promise<T>;
}

/**
 * A stateless client for interacting with Gmail.
 * For every action, it requests a page via usePage, authenticates, runs the action, and completes.
 */
export class GmailClient {
    constructor(private options: GmailClientOptions) {}

    async searchEmails(query?: string, limit?: number): Promise<EmailMetadata[]> {
        return this.options.usePage(async (page) => {
            await ensureAuthenticatedGmail(page, this.options);
            return searchEmails(page, query, limit);
        });
    }

    async readThread(threadId: string): Promise<ThreadMessage[]> {
        return this.options.usePage(async (page) => {
            await ensureAuthenticatedGmail(page, this.options);
            return readThread(page, threadId);
        });
    }

    async sendEmail(options: SendEmailOptions): Promise<void> {
        return this.options.usePage(async (page) => {
            await ensureAuthenticatedGmail(page, this.options);
            return sendEmail(page, options);
        });
    }

    async close(): Promise<void> {
        // The client is now stateless and manages page lifecycles per-action.
        // There are no persistent resources to clean up here.
    }
}

export function createGmailClient(options: GmailClientOptions): GmailClient {
    return new GmailClient(options);
}
