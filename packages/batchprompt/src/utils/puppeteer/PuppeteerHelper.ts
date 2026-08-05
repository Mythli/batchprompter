import puppeteer, { Browser, LaunchOptions, Page } from 'puppeteer';
import fs from 'fs/promises';
import { PuppeteerPageHelper } from './PuppeteerPageHelper.js';
import type { Fetcher } from 'llm-fns';

export interface CacheLike {
    get<T>(key: string): Promise<T | undefined | null> | T | undefined | null;
    set(key: string, value: any, ttl?: number): Promise<any> | any;
}

export interface PuppeteerHelperOptions {
    browserUserDataDir?: string;
    puppeteerLaunchOptions?: LaunchOptions;
    cache?: CacheLike;
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
    private cache?: CacheLike;
    private fetcher?: Fetcher;

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

    private setupProcessHandlers() {
        const handler = async () => {
            await this.close();
            process.exit(0);
        };

        process.off('SIGINT', handler);
        process.off('SIGTERM', handler);

        process.on('SIGINT', handler);
        process.on('SIGTERM', handler);
    }

    private async performInit(): Promise<void> {
        const {
            browserUserDataDir,
            puppeteerLaunchOptions,
        } = this.options;

        try {
            await fs.mkdir(browserUserDataDir!, { recursive: true });
        } catch {}

        this.browser = await puppeteer.launch({
            ...puppeteerLaunchOptions,
            userDataDir: browserUserDataDir,
            pipe: true,
        });

        const launchedBrowser = this.browser;
        launchedBrowser.on('disconnected', () => {
            if (this.browser === launchedBrowser) {
                this.browser = null;
                this.initPromise = null;
                this.pagesOpenedCount = 0;
                this.activePagesCount = 0;
            }
        });

        this.setupProcessHandlers();

        if (!this.browser || !this.browser.connected) {
            throw new Error('Browser was not created or connected properly.');
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

    public init(): Promise<void> {
        if (!this.initPromise) {
            this.initPromise = this.performInit();
        }
        return this.initPromise;
    }

    public async close(): Promise<void> {
        if (this.initPromise) {
            await this.initPromise;
        }
        if (this.browser) {
            try {
                const closeTimeout = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Browser close timeout')), 5000)
                );

                await Promise.race([
                    this.browser.close(),
                    closeTimeout,
                ]);
            } catch {
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

    private async ensureInitialized(): Promise<void> {
        if (this.isRestarting && this.restartPromise) {
            await this.restartPromise;
        }

        if (!this.initPromise) {
            await this.init();
        } else {
            await this.initPromise;
        }
        if (!this.browser) {
            throw new Error('Puppeteer initialization failed. Browser is not available.');
        }
    }

    private async ensureHealthyBrowser(): Promise<void> {
        await this.ensureInitialized();

        if (!this.browser || !this.browser.connected) {
            await this.restartBrowser();
        }
    }

    private isRecoverableBrowserError(error: any): boolean {
        const message = error?.message || String(error);
        return [
            'Protocol error',
            'Connection closed',
            'Target closed',
            'Session closed',
            'Browser has disconnected',
            'browser is closed',
            'WebSocket is not open',
        ].some(part => message.includes(part));
    }

    private async restartBrowser(): Promise<void> {
        if (this.isRestarting) {
            if (this.restartPromise) await this.restartPromise;
            return;
        }

        this.isRestarting = true;

        this.restartPromise = (async () => {
            try {
                if (this.activePagesCount > 0) {
                    const startTime = Date.now();
                    while (this.activePagesCount > 0) {
                        if (Date.now() - startTime > this.restartTimeout) {
                            break;
                        }
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }

                await this.close();
                await this.init();
            } catch (e: any) {
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

    private async checkAndRestartIfNeeded(): Promise<void> {
        if (this.isRestarting) {
            if (this.restartPromise) await this.restartPromise;
            return;
        }

        if (this.pagesOpenedCount >= this.maxPagesLimit) {
            await this.restartBrowser();
        }
    }

    private async createTrackedPage(): Promise<Page> {
        const page = await this.browser!.newPage();

        this.pagesOpenedCount++;
        this.activePagesCount++;

        page.once('close', () => {
            this.activePagesCount = Math.max(0, this.activePagesCount - 1);
        });

        return page;
    }

    public async getBrowser(): Promise<Browser> {
        await this.ensureHealthyBrowser();
        return this.browser!;
    }

    public async getBlocker(): Promise<null> {
        await this.ensureHealthyBrowser();
        return null;
    }

    public async getPage(): Promise<Page> {
        await this.checkAndRestartIfNeeded();
        await this.ensureHealthyBrowser();

        try {
            return await this.createTrackedPage();
        } catch (error: any) {
            if (!this.isRecoverableBrowserError(error)) {
                throw error;
            }

            await this.restartBrowser();
            return this.createTrackedPage();
        }
    }

    public async getPageHelper(): Promise<PuppeteerPageHelper> {
        const page = await this.getPage();
        const pageHelper = new PuppeteerPageHelper(page, null, this.cache, this.fetcher);
        await pageHelper.setupPage();
        return pageHelper;
    }
}
