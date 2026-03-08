import type { Page } from 'puppeteer';
import { ensureAuthenticatedGmail, GmailAuthOptions } from './auth.js';
import { searchEmailsOnPage, EmailMetadata } from './search.js';
import { readThread, setThreadReadStatus, ThreadMessage, ReadThreadOptions } from './read.js';
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
                    // Open a single temporary page just for authentication.
                    // We don't pass a targetUrl here, so it defaults to the base inbox.
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
     * Wrapper that guarantees the browser is authenticated and navigated to the target URL
     * BEFORE executing the domain action. Includes an exponential backoff retry mechanism.
     */
    private async withAuthenticatedPage<T>(targetUrl: string, action: (page: Page) => Promise<T>, maxRetries = 3): Promise<T> {
        let attempt = 0;
        
        while (attempt < maxRetries) {
            attempt++;
            try {
                // 1. Wait for global authentication (does not open a page if already auth'd or waiting)
                await this.ensureGlobalAuth();
                
                // 2. Request a page, navigate to the specific URL, and execute the action
                return await this.options.usePage(async (page) => {
                    // Navigate and ensure session is valid. If the session dropped, 
                    // this will handle the redirect to accounts.google.com and log back in.
                    await ensureAuthenticatedGmail(page, { ...this.options, targetUrl });
                    
                    // Check for common Gmail error pages to fail fast and trigger a retry
                    const isErrorPage = await page.evaluate(() => {
                        const bodyText = document.body.innerText || '';
                        return bodyText.includes('Temporary Error') || 
                               bodyText.includes('502. That’s an error.') ||
                               bodyText.includes('Some Gmail features have failed to load');
                    });

                    if (isErrorPage) {
                        throw new Error(`Gmail served an error page at ${targetUrl}`);
                    }

                    // The page is now authenticated, at the correct URL, and not an error page.
                    // Execute the domain-specific scraping/interaction logic.
                    return await action(page);
                });
            } catch (error) {
                if (attempt >= maxRetries) {
                    console.error(`[GmailClient] Action failed after ${maxRetries} attempts. Throwing error.`);
                    throw error;
                }
                
                const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                console.warn(`[GmailClient] Action failed on attempt ${attempt}/${maxRetries}. Retrying in ${backoffMs}ms... Error: ${(error as Error).message}`);
                
                await new Promise<void>(resolve => {
                    const timer = setInterval(() => {
                        clearInterval(timer);
                        resolve();
                    }, backoffMs);
                });
            }
        }
        throw new Error("Unreachable");
    }

    async searchEmails(query?: string, limit: number = 50): Promise<EmailMetadata[]> {
        const pageSize = 50;
        const numPages = Math.ceil(limit / pageSize);

        if (numPages <= 1) {
            const targetHash = query ? `#search/${encodeURIComponent(query)}` : `#inbox`;
            const targetUrl = `https://mail.google.com/mail/u/0/${targetHash}`;
            const results = await this.withAuthenticatedPage(targetUrl, page => searchEmailsOnPage(page));
            return results.slice(0, limit);
        }

        const pageIndices = Array.from({ length: numPages }, (_, i) => i + 1);

        // Fetch all pages in parallel using the queue
        const pageResults = await Promise.all(
            pageIndices.map(pageIndex => {
                const pageSuffix = pageIndex > 1 ? `/p${pageIndex}` : '';
                const targetHash = query ? `#search/${encodeURIComponent(query)}${pageSuffix}` : `#inbox${pageSuffix}`;
                const targetUrl = `https://mail.google.com/mail/u/0/${targetHash}`;
                return this.withAuthenticatedPage(targetUrl, page => searchEmailsOnPage(page));
            })
        );

        const allEmails: EmailMetadata[] = [];
        for (const results of pageResults) {
            for (const email of results) {
                if (!allEmails.find(e => e.id === email.id)) {
                    allEmails.push(email);
                }
            }
        }

        return allEmails.slice(0, limit);
    }

    async readThread(threadId: string, options?: ReadThreadOptions): Promise<ThreadMessage[]> {
        const targetUrl = `https://mail.google.com/mail/u/0/#all/${threadId}`;
        return this.withAuthenticatedPage(targetUrl, page => readThread(page, options));
    }

    async setThreadReadStatus(threadId: string, read: boolean): Promise<void> {
        const targetUrl = `https://mail.google.com/mail/u/0/#all/${threadId}`;
        return this.withAuthenticatedPage(targetUrl, page => setThreadReadStatus(page, read));
    }

    async sendEmail(options: SendEmailOptions): Promise<void> {
        const targetUrl = options.replyToId 
            ? `https://mail.google.com/mail/u/0/#inbox/${options.replyToId}`
            : `https://mail.google.com/mail/u/0/#inbox`;
            
        return this.withAuthenticatedPage(targetUrl, page => sendEmail(page, options));
    }

    /**
     * Orchestrates searching for emails and reading their full threads in parallel.
     * This leverages the underlying queue architecture to safely fan out the reads.
     */
    async searchAndReadThreads(query?: string, limit?: number): Promise<ThreadWithMetadata[]> {
        // 1. Search for emails (uses multiple page slots temporarily if limit > 50)
        const searchResults = await this.searchEmails(query, limit);

        // 2. Read all threads in parallel (each uses 1 page slot temporarily, managed by the queue)
        const threads = await Promise.all(
            searchResults.map(async (metadata) => {
                const messages = await this.readThread(metadata.id, { keepUnread: metadata.isUnread });
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
