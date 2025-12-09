import puppeteer, { Browser, Page, LaunchOptions as PuppeteerLaunchOptions } from 'puppeteer';
import fs from 'fs/promises';
import { PuppeteerPageHelper } from './PuppeteerPageHelper.js';
import { Cache } from 'cache-manager';
import {Fetcher} from "llm-fns";

export interface PuppeteerHelperOptions {
    browserUserDataDir?: string;
    puppeteerLaunchOptions?: PuppeteerLaunchOptions;
    cache?: Cache;
    fetcher?: Fetcher;
    maxPagesBeforeRestart?: number;
    restartTimeout?: number;
}

/**
 * A helper class to manage the lifecycle of a Puppeteer Browser instance.
 */
export class PuppeteerHelper {
    private options: PuppeteerHelperOptions;
    private browser: Browser | null = null;
    private initPromise: Promise<void> | null = null;
    private cache?: Cache;
    private fetcher?: Fetcher;

    // Restart Policy State
    private pagesOpenedCount = 0;
    private activePagesCount = 0;
    private isRestarting = false;
    private restartPromise: Promise<void> | null = null;
    private readonly maxPagesLimit: number;
    private readonly restartTimeout: number;

    constructor(options: PuppeteerHelperOptions = {}) {
        this.options = {
            browserUserDataDir: 'puppeteer_user_data',
            ...options,
        };
        this.cache = options.cache;
        this.fetcher = options.fetcher;
        this.maxPagesLimit = options.maxPagesBeforeRestart || 50;
        this.restartTimeout = options.restartTimeout || 10000;
    }

    private async _performInit(): Promise<void> {
        const {
            browserUserDataDir,
            puppeteerLaunchOptions,
        } = this.options;

        // Browser initialization
        try {
            await fs.rm(browserUserDataDir!, { recursive: true, force: true });
            await fs.mkdir(browserUserDataDir!, { recursive: true });
        } catch (error: any) {
            console.warn(`Could not manage user data directory '${browserUserDataDir}': ${error.message}`);
        }

        this.browser = await puppeteer.launch({
            ...puppeteerLaunchOptions,
            userDataDir: browserUserDataDir,
        });

        // Health check
        if (!this.browser || !this.browser.isConnected()) {
            throw new Error("Browser was not created or connected properly.");
        }
        try {
            const page = await this.browser.newPage();
            await page.close();
        } catch (pageError: any) {
            if (this.browser) {
                await this.browser.close();
            }
            throw new Error(`Browser health check failed: Could not create a new page. ${pageError.message}`);
        }
    }

    /**
     * Initializes the Puppeteer browser instance.
     * This must be called before any other methods are used.
     */
    public init(): Promise<void> {
        if (!this.initPromise) {
            this.initPromise = this._performInit();
        }
        return this.initPromise;
    }

    /**
     * Closes the Puppeteer browser and cleans up resources.
     */
    public async close(): Promise<void> {
        if (this.initPromise) {
            await this.initPromise;
        }
        if (this.browser) {
            try {
                await this.browser.close();
            } catch (closeError: any) {
                console.warn(`Error closing browser: ${closeError.message}`);
            }
        }
        this.browser = null;
        this.initPromise = null;
        this.pagesOpenedCount = 0;
        this.activePagesCount = 0;
    }

    private async _ensureInitialized(): Promise<void> {
        // If we are currently restarting, wait for that to finish
        if (this.isRestarting && this.restartPromise) {
            await this.restartPromise;
        }

        if (!this.initPromise) {
            // Auto-initialize if init() wasn't called explicitly
            console.log("PuppeteerHelper not explicitly initialized. Calling init() automatically.");
            await this.init();
        } else {
            await this.initPromise;
        }
        if (!this.browser) {
            throw new Error("Puppeteer initialization failed. Browser is not available.");
        }
    }

    private async _checkAndRestartIfNeeded(): Promise<void> {
        if (this.isRestarting) {
            if (this.restartPromise) await this.restartPromise;
            return;
        }

        if (this.pagesOpenedCount >= this.maxPagesLimit) {
            console.log(`[PuppeteerHelper] Page limit reached (${this.pagesOpenedCount}/${this.maxPagesLimit}). Initiating restart...`);
            this.isRestarting = true;
            
            this.restartPromise = (async () => {
                try {
                    // 1. Wait for active pages to close or timeout
                    if (this.activePagesCount > 0) {
                        console.log(`[PuppeteerHelper] Waiting for ${this.activePagesCount} active pages to close (Timeout: ${this.restartTimeout}ms)...`);
                        
                        const startTime = Date.now();
                        while (this.activePagesCount > 0) {
                            if (Date.now() - startTime > this.restartTimeout) {
                                console.warn(`[PuppeteerHelper] Restart timeout reached. Forcing close with ${this.activePagesCount} active pages.`);
                                break;
                            }
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }

                    // 2. Close existing browser
                    console.log(`[PuppeteerHelper] Closing browser...`);
                    await this.close();

                    // 3. Re-initialize
                    console.log(`[PuppeteerHelper] Starting new browser instance...`);
                    await this.init();
                    
                    console.log(`[PuppeteerHelper] Browser restarted successfully.`);
                } catch (e: any) {
                    console.error(`[PuppeteerHelper] Error during restart: ${e.message}`);
                    // Reset flags so we can try again or fail hard next time
                    this.isRestarting = false;
                    this.restartPromise = null;
                    throw e;
                } finally {
                    this.isRestarting = false;
                    this.restartPromise = null;
                }
            })();

            await this.restartPromise;
        }
    }

    /**
     * Returns the raw Puppeteer Browser instance.
     */
    public async getBrowser(): Promise<Browser> {
        await this._ensureInitialized();
        return this.browser!;
    }

    /**
     * Returns null, as the ad blocker has been removed.
     */
    public async getBlocker(): Promise<null> {
        await this._ensureInitialized();
        return null;
    }

    /**
     * Creates and returns a new Puppeteer Page. The caller is responsible for closing the page.
     */
    public async getPage(): Promise<Page> {
        await this._checkAndRestartIfNeeded();
        await this._ensureInitialized();
        
        const page = await this.browser!.newPage();
        
        // Track usage
        this.pagesOpenedCount++;
        this.activePagesCount++;
        
        console.log(`[PuppeteerHelper] Page opened. Total opened: ${this.pagesOpenedCount}/${this.maxPagesLimit}. Active: ${this.activePagesCount}`);

        // Listen for close to decrement active count
        page.once('close', () => {
            this.activePagesCount--;
            console.log(`[PuppeteerHelper] Page closed. Active: ${this.activePagesCount}`);
        });

        return page;
    }

    /**
     * Creates a new Puppeteer Page and wraps it in a PuppeteerPageHelper.
     * The helper comes pre-configured with the ad blocker.
     * @returns A promise that resolves to a new PuppeteerPageHelper instance.
     */
    public async getPageHelper(): Promise<PuppeteerPageHelper> {
        // getPage handles the restart logic and counting
        const page = await this.getPage();
        
        const pageHelper = new PuppeteerPageHelper(page, null, this.cache, this.fetcher);
        await pageHelper.setupPage(); // Automatically setup page with blocker
        return pageHelper;
    }
}
