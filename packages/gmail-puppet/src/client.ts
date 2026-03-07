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
    // A simple FIFO lock to ensure only one page attempts the authentication/navigation flow at a time.
    // This prevents multiple parallel tabs from racing to type credentials if the session is fresh.
    private authLock: Promise<void> = Promise.resolve();
    
    // Flag to indicate if the browser context has already been authenticated in this session.
    private isAuthenticated: boolean = false;

    constructor(private options: GmailClientOptions) {}

    /**
     * Safely runs the authentication check, ensuring only one page performs it at a time.
     * Uses double-checked locking so subsequent pages skip the slow navigation check.
     */
    private async safeAuthenticate(page: Page): Promise<void> {
        // First check: if already authenticated, skip the lock entirely
        if (this.isAuthenticated) {
            return;
        }

        // Atomically chain onto the existing lock
        const previousLock = this.authLock;
        
        let releaseLock!: () => void;
        this.authLock = new Promise(resolve => {
            releaseLock = resolve;
        });

        // Wait for any previous authentication check to finish (ignore errors from previous runs)
        await previousLock.catch(() => {});

        try {
            // Second check: another page might have authenticated while we were waiting for the lock
            if (this.isAuthenticated) {
                return;
            }

            await ensureAuthenticatedGmail(page, this.options);
            
            // Mark as authenticated for all future pages in this client instance
            this.isAuthenticated = true;
        } finally {
            // Release the lock for the next page in line
            releaseLock();
        }
    }

    async searchEmails(query?: string, limit?: number): Promise<EmailMetadata[]> {
        return this.options.usePage(async (page) => {
            await this.safeAuthenticate(page);
            return searchEmails(page, query, limit);
        });
    }

    async readThread(threadId: string): Promise<ThreadMessage[]> {
        return this.options.usePage(async (page) => {
            await this.safeAuthenticate(page);
            return readThread(page, threadId);
        });
    }

    async sendEmail(options: SendEmailOptions): Promise<void> {
        return this.options.usePage(async (page) => {
            await this.safeAuthenticate(page);
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
