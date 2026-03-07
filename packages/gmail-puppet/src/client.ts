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

export interface ThreadWithMetadata extends EmailMetadata {
    messages: ThreadMessage[];
}

/**
 * A stateless client for interacting with Gmail.
 * For every action, it requests a page via usePage, authenticates, runs the action, and completes.
 */
export class GmailClient {
    // A global promise to ensure only one authentication flow runs at a time across all tasks.
    private authPromise: Promise<void> | null = null;
    
    // Flag to indicate if the browser context has already been authenticated in this session.
    private isAuthenticated: boolean = false;

    constructor(private options: GmailClientOptions) {}

    /**
     * Ensures the browser context is authenticated.
     * If not authenticated, it opens a single temporary page to perform the login.
     * Other concurrent calls will wait for this single promise to resolve without opening pages.
     */
    private async ensureGlobalAuth(): Promise<void> {
        if (this.isAuthenticated) {
            return;
        }

        if (!this.authPromise) {
            this.authPromise = (async () => {
                try {
                    // Open a single temporary page just for authentication
                    await this.options.usePage(async (page) => {
                        await ensureAuthenticatedGmail(page, this.options);
                    });
                    this.isAuthenticated = true;
                } finally {
                    // Clear the promise so future calls can retry if it failed,
                    // or just rely on isAuthenticated if it succeeded.
                    this.authPromise = null;
                }
            })();
        }

        await this.authPromise;
    }

    /**
     * Wrapper that guarantees the browser is authenticated BEFORE requesting a page for the actual task.
     */
    private async withAuthenticatedPage<T>(action: (page: Page) => Promise<T>): Promise<T> {
        // 1. Wait for global authentication (does not open a page if already auth'd or waiting)
        await this.ensureGlobalAuth();
        
        // 2. Now that we are authenticated, request a page and execute the domain action
        return this.options.usePage(async (page) => {
            return action(page);
        });
    }

    async searchEmails(query?: string, limit?: number): Promise<EmailMetadata[]> {
        return this.withAuthenticatedPage(page => searchEmails(page, query, limit));
    }

    async readThread(threadId: string): Promise<ThreadMessage[]> {
        return this.withAuthenticatedPage(page => readThread(page, threadId));
    }

    async sendEmail(options: SendEmailOptions): Promise<void> {
        return this.withAuthenticatedPage(page => sendEmail(page, options));
    }

    /**
     * Orchestrates searching for emails and reading their full threads in parallel.
     * This leverages the underlying queue architecture to safely fan out the reads.
     */
    async searchAndReadThreads(query?: string, limit?: number): Promise<ThreadWithMetadata[]> {
        // 1. Search for emails (uses 1 page slot temporarily)
        const searchResults = await this.searchEmails(query, limit);

        // 2. Read all threads in parallel (each uses 1 page slot temporarily, managed by the queue)
        const threads = await Promise.all(
            searchResults.map(async (metadata) => {
                const messages = await this.readThread(metadata.id);
                return {
                    ...metadata,
                    messages
                };
            })
        );

        return threads;
    }

    async close(): Promise<void> {
        // The client is now stateless and manages page lifecycles per-action.
        // There are no persistent resources to clean up here.
    }
}

export function createGmailClient(options: GmailClientOptions): GmailClient {
    return new GmailClient(options);
}
