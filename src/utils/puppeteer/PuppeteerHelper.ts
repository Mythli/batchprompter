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

    constructor(options: PuppeteerHelperOptions = {}) {
        this.options = {
            browserUserDataDir: 'puppeteer_user_data',
            ...options,
        };
        this.cache = options.cache;
        this.fetcher = options.fetcher;
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
    }

    private async _ensureInitialized(): Promise<void> {
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
        await this._ensureInitialized();
        return this.browser!.newPage();
    }

    /**
     * Creates a new Puppeteer Page and wraps it in a PuppeteerPageHelper.
     * The helper comes pre-configured with the ad blocker.
     * @returns A promise that resolves to a new PuppeteerPageHelper instance.
     */
    public async getPageHelper(): Promise<PuppeteerPageHelper> {
        await this._ensureInitialized();
        const page = await this.browser!.newPage();
        const pageHelper = new PuppeteerPageHelper(page, null, this.cache, this.fetcher);
        await pageHelper.setupPage(); // Automatically setup page with blocker
        return pageHelper;
    }
}
