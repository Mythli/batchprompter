import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import { PuppeteerPageHelper } from './PuppeteerPageHelper.js';
/**
 * A helper class to manage the lifecycle of a Puppeteer Browser instance.
 */
export class PuppeteerHelper {
    options;
    browser = null;
    initPromise = null;
    cache;
    fetcher;
    // Restart Policy State
    pagesOpenedCount = 0;
    activePagesCount = 0;
    isRestarting = false;
    restartPromise = null;
    maxPagesLimit;
    restartTimeout;
    constructor(options = {}) {
        this.options = {
            browserUserDataDir: 'puppeteer_user_data',
            ...options,
        };
        this.cache = options.cache;
        this.fetcher = options.fetcher;
        this.maxPagesLimit = options.maxPagesBeforeRestart || 50;
        this.restartTimeout = options.restartTimeout || 10000;
    }
    setupProcessHandlers() {
        const handler = async () => {
            console.log('[PuppeteerHelper] Process terminating. Closing browser...');
            await this.close();
            process.exit(0);
        };
        // Prevent adding multiple listeners if init is called multiple times
        process.off('SIGINT', handler);
        process.off('SIGTERM', handler);
        process.on('SIGINT', handler);
        process.on('SIGTERM', handler);
    }
    async _performInit() {
        const { browserUserDataDir, puppeteerLaunchOptions, } = this.options;
        // Browser initialization
        try {
            await fs.rm(browserUserDataDir, { recursive: true, force: true });
            await fs.mkdir(browserUserDataDir, { recursive: true });
        }
        catch (error) {
            console.warn(`Could not manage user data directory '${browserUserDataDir}': ${error.message}`);
        }
        this.browser = await puppeteer.launch({
            ...puppeteerLaunchOptions,
            userDataDir: browserUserDataDir,
            pipe: true, // Use pipe instead of websocket for better process control
        });
        this.setupProcessHandlers();
        // Health check
        if (!this.browser || !this.browser.isConnected()) {
            throw new Error("Browser was not created or connected properly.");
        }
        try {
            const page = await this.browser.newPage();
            await page.close();
        }
        catch (pageError) {
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
    init() {
        if (!this.initPromise) {
            this.initPromise = this._performInit();
        }
        return this.initPromise;
    }
    /**
     * Closes the Puppeteer browser and cleans up resources.
     */
    async close() {
        if (this.initPromise) {
            await this.initPromise;
        }
        if (this.browser) {
            try {
                // Create a timeout promise
                const closeTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Browser close timeout')), 5000));
                // Race standard close against the timeout
                await Promise.race([
                    this.browser.close(),
                    closeTimeout
                ]);
            }
            catch (closeError) {
                console.warn(`Error closing browser gracefully: ${closeError.message}. Force killing process.`);
                // Force kill the process if graceful close failed/timed out
                const process = this.browser.process();
                if (process) {
                    process.kill('SIGKILL');
                }
            }
        }
        this.browser = null;
        this.initPromise = null;
        this.pagesOpenedCount = 0;
        this.activePagesCount = 0;
    }
    async _ensureInitialized() {
        // If we are currently restarting, wait for that to finish
        if (this.isRestarting && this.restartPromise) {
            await this.restartPromise;
        }
        if (!this.initPromise) {
            // Auto-initialize if init() wasn't called explicitly
            console.log("PuppeteerHelper not explicitly initialized. Calling init() automatically.");
            await this.init();
        }
        else {
            await this.initPromise;
        }
        if (!this.browser) {
            throw new Error("Puppeteer initialization failed. Browser is not available.");
        }
    }
    async _checkAndRestartIfNeeded() {
        if (this.isRestarting) {
            if (this.restartPromise)
                await this.restartPromise;
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
                }
                catch (e) {
                    console.error(`[PuppeteerHelper] Error during restart: ${e.message}`);
                    // Reset flags so we can try again or fail hard next time
                    this.isRestarting = false;
                    this.restartPromise = null;
                    throw e;
                }
                finally {
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
    async getBrowser() {
        await this._ensureInitialized();
        return this.browser;
    }
    /**
     * Returns null, as the ad blocker has been removed.
     */
    async getBlocker() {
        await this._ensureInitialized();
        return null;
    }
    /**
     * Creates and returns a new Puppeteer Page. The caller is responsible for closing the page.
     */
    async getPage() {
        await this._checkAndRestartIfNeeded();
        await this._ensureInitialized();
        const page = await this.browser.newPage();
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
    async getPageHelper() {
        // getPage handles the restart logic and counting
        const page = await this.getPage();
        const pageHelper = new PuppeteerPageHelper(page, null, this.cache, this.fetcher);
        await pageHelper.setupPage(); // Automatically setup page with blocker
        return pageHelper;
    }
}
//# sourceMappingURL=PuppeteerHelper.js.map