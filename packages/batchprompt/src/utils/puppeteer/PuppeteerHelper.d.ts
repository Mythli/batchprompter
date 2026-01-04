import { Browser, Page, LaunchOptions as PuppeteerLaunchOptions } from 'puppeteer';
import { PuppeteerPageHelper } from './PuppeteerPageHelper.js';
import { Cache } from 'cache-manager';
import { Fetcher } from "llm-fns";
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
export declare class PuppeteerHelper {
    private options;
    private browser;
    private initPromise;
    private cache?;
    private fetcher?;
    private pagesOpenedCount;
    private activePagesCount;
    private isRestarting;
    private restartPromise;
    private readonly maxPagesLimit;
    private readonly restartTimeout;
    constructor(options?: PuppeteerHelperOptions);
    private setupProcessHandlers;
    private _performInit;
    /**
     * Initializes the Puppeteer browser instance.
     * This must be called before any other methods are used.
     */
    init(): Promise<void>;
    /**
     * Closes the Puppeteer browser and cleans up resources.
     */
    close(): Promise<void>;
    private _ensureInitialized;
    private _checkAndRestartIfNeeded;
    /**
     * Returns the raw Puppeteer Browser instance.
     */
    getBrowser(): Promise<Browser>;
    /**
     * Returns null, as the ad blocker has been removed.
     */
    getBlocker(): Promise<null>;
    /**
     * Creates and returns a new Puppeteer Page. The caller is responsible for closing the page.
     */
    getPage(): Promise<Page>;
    /**
     * Creates a new Puppeteer Page and wraps it in a PuppeteerPageHelper.
     * The helper comes pre-configured with the ad blocker.
     * @returns A promise that resolves to a new PuppeteerPageHelper instance.
     */
    getPageHelper(): Promise<PuppeteerPageHelper>;
}
//# sourceMappingURL=PuppeteerHelper.d.ts.map