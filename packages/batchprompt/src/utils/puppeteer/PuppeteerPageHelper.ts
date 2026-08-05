import { ElementHandle, HTTPRequest, Page, Viewport } from 'puppeteer';
import { CachedResponse, Fetcher } from 'llm-fns';
import { compressHtml } from '../compressHtml.js';
import { htmlToMarkdown } from '../htmlToMarkdown.js';
import type { CacheLike } from './PuppeteerHelper.js';

export interface Resolution {
    width: number;
    height: number;
}

export interface LinkData {
    href: string;
    text: string;
}

export interface PageNavigationOptions {
    dismissCookies?: boolean;
    htmlOnly?: boolean;
    resolution?: Resolution;
}

export interface NavigateAndCacheOptions extends PageNavigationOptions {
    cacheKey?: string;
    ttl?: number;
    beforeNavigate?: (pageHelper: PuppeteerPageHelper) => Promise<void>;
    afterNavigate?: (pageHelper: PuppeteerPageHelper) => Promise<void>;
    closePage?: boolean;
}

export interface ScrapedPageContent {
    html: string;
    markdown: string;
    links: LinkData[];
}

type PageFetchResult = {
    base64: string;
    headers: Record<string, string>;
    status: number;
    statusText: string;
    finalUrl: string;
};

export async function dismissCookieBanners(page: Page): Promise<void> {
    const keywords = /accept|agree|consent|allow|got it|i understand|akzeptieren|zustimmen|einverstanden|erlauben|zulassen|verstanden|schliessen|schließen|close/i;

    let bannerClicked = false;
    const clickableElements = await page.$$('button, a, [role="button"]');

    for (const element of clickableElements) {
        try {
            const text = await element.evaluate(node => node.textContent?.trim() ?? '');

            if (keywords.test(text) && await element.isIntersectingViewport()) {
                await element.click();
                bannerClicked = true;
            }
        } catch (error: any) {
            if (!error.message.includes('Node is detached from the DOM')) {
                // Best effort cookie handling; scraping should continue on click failures.
            }
        }
    }

    if (bannerClicked) {
        await new Promise(resolve => setTimeout(resolve, 250));
    }
}

export class PuppeteerPageHelper {
    private isInterceptionEnabled = false;

    private requestHandler = (request: HTTPRequest) => {
        if (['stylesheet', 'font', 'image', 'media'].includes(request.resourceType())) {
            request.abort().catch(() => {});
        } else {
            request.continue().catch(() => {});
        }
    };

    constructor(
        private page: Page,
        _blocker: null,
        private cache?: CacheLike,
        private fetcher?: Fetcher
    ) {}

    public getPage(): Page {
        return this.page;
    }

    public async enableHtmlMode(): Promise<void> {
        if (this.isInterceptionEnabled) {
            return;
        }
        this.page.on('request', this.requestHandler);
        await this.page.setRequestInterception(true);
        this.isInterceptionEnabled = true;
    }

    async setupPage(): Promise<void> {
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        this.page.on('dialog', async (dialog) => {
            await dialog.dismiss();
        });

        await this.page.setViewport({ width: 1920, height: 1080 });
    }

    async navigateToUrlAndGetHtml(url: string, options: PageNavigationOptions = {}): Promise<string> {
        const response = await this.navigateToUrl(url, options);
        if (!response) {
            return this.getFinalHtml();
        }
        try {
            return await response.text();
        } catch {
            return this.getFinalHtml();
        }
    }

    async navigateToUrl(url: string, options: PageNavigationOptions = {}) {
        const { dismissCookies = false, htmlOnly = false, resolution } = options;

        try {
            if (resolution) {
                const currentViewport = this.page.viewport();
                if (!currentViewport || currentViewport.width !== resolution.width || currentViewport.height !== resolution.height) {
                    await this.page.setViewport(resolution as Viewport);
                }
            }

            if (htmlOnly) {
                await this.enableHtmlMode();
            }

            const response = await this.page.goto(url, { waitUntil: 'networkidle0', timeout: htmlOnly ? 10000 : 30000 });

            if (dismissCookies) {
                await dismissCookieBanners(this.page);
            }
            return response;
        } catch (error: any) {
            if (error.name === 'TimeoutError') {
                return null;
            }
            throw error;
        }
    }

    async navigateAndCache<T>(
        url: string,
        action: (pageHelper: PuppeteerPageHelper) => Promise<T>,
        options: NavigateAndCacheOptions = {}
    ): Promise<T> {
        const { cacheKey = url, ttl = 3600 * 1000, beforeNavigate, afterNavigate, closePage = false, ...navOptions } = options;

        if (this.cache) {
            const cachedResult = await this.cache.get<T>(cacheKey);
            if (cachedResult) {
                if (closePage) {
                    await this.close();
                }
                return cachedResult;
            }
        }

        try {
            if (beforeNavigate) {
                await beforeNavigate(this);
            }

            await this.navigateToUrl(url, navOptions);

            if (afterNavigate) {
                await afterNavigate(this);
            }

            const result = await action(this);

            if (this.cache) {
                await this.cache.set(cacheKey, result, ttl);
            }

            return result;
        } finally {
            if (closePage) {
                await this.close();
            }
        }
    }

    async scrapeUrl(url: string, options: NavigateAndCacheOptions = {}): Promise<ScrapedPageContent> {
        return this.navigateAndCache(
            url,
            async (ph) => ph.getProcessedContent(),
            options
        );
    }

    async getProcessedContent(): Promise<ScrapedPageContent> {
        const html = await this.getFinalHtml();
        const links = await this.extractLinksWithText();
        const compressed = compressHtml(html);
        const markdown = htmlToMarkdown(compressed);

        return { html, markdown, links };
    }

    public async ensurePageAtUrl(url: string, options: PageNavigationOptions = {}): Promise<void> {
        const currentPageUrl = this.page.url();

        if (currentPageUrl === 'about:blank') {
            await this.navigateToUrl(url, options);
        }
    }

    async setHtmlContent(html: string): Promise<void> {
        await this.page.setContent(html, { waitUntil: 'domcontentloaded' });
        await this.page.waitForNetworkIdle();
    }

    async getFinalHtml(timeoutMs = 15000): Promise<string> {
        try {
            return await Promise.race([
                this.page.content(),
                new Promise<string>((_, reject) =>
                    setTimeout(() => reject(new Error(`Timeout of ${timeoutMs}ms exceeded`)), timeoutMs)
                ),
            ]);
        } catch {
            try {
                return await Promise.race([
                    this.page.evaluate(() => document.documentElement.outerHTML),
                    new Promise<string>((_, reject) =>
                        setTimeout(() => reject(new Error('Fallback JS evaluation timed out')), 5000)
                    ),
                ]);
            } catch (fallbackError: any) {
                throw new Error(`Failed to get page content: ${fallbackError.message}`);
            }
        }
    }

    public async extractLinksWithText(): Promise<LinkData[]> {
        return this.page.evaluate(() => {
            const linkData: { href: string; text: string; }[] = [];
            const anchors = Array.from(document.querySelectorAll('a'));
            for (const anchor of anchors) {
                const href = (anchor as HTMLAnchorElement).href;
                if (href && (href.startsWith('http:') || href.startsWith('https://'))) {
                    const text = (anchor.innerText || '').trim().substring(0, 200);
                    linkData.push({ href, text });
                }
            }
            return linkData;
        });
    }

    private async fetchAndEvaluateResource(url: string): Promise<PageFetchResult> {
        try {
            const currentPageUrl = this.page.url();

            const result = await this.page.evaluate(async (resourceToFetchUrl, pageUrl) => {
                try {
                    const resourceUrl = new URL(resourceToFetchUrl, pageUrl);
                    const pageOriginUrl = new URL(pageUrl);
                    const resourceHost = resourceUrl.hostname.replace(/^www\./, '');
                    const pageHost = pageOriginUrl.hostname.replace(/^www\./, '');

                    const finalUrlToFetch = resourceHost === pageHost
                        ? new URL(resourceUrl.pathname + resourceUrl.search + resourceUrl.hash, pageOriginUrl.origin).href
                        : resourceUrl.href;

                    const response = await fetch(finalUrlToFetch);

                    const headers: Record<string, string> = {};
                    response.headers.forEach((value, key) => {
                        headers[key] = value;
                    });

                    const buffer = await response.arrayBuffer();
                    const base64 = btoa(
                        new Uint8Array(buffer)
                            .reduce((data, byte) => data + String.fromCharCode(byte), '')
                    );

                    return {
                        base64,
                        headers,
                        status: response.status,
                        statusText: response.statusText,
                        finalUrl: response.url,
                        error: null,
                    };
                } catch (e: any) {
                    return {
                        error: {
                            name: e.name,
                            message: e.message,
                            stack: e.stack,
                        },
                        base64: null,
                        headers: null,
                        status: 0,
                        statusText: '',
                        finalUrl: resourceToFetchUrl,
                    };
                }
            }, url, currentPageUrl);

            if (result.error) {
                const { name, message, stack } = result.error;
                const errorMessage = `Error fetching resource in page context for ${url}: [${name}] ${message}`;
                const error = new Error(errorMessage);
                error.stack = `${errorMessage}\n\n--- Browser Context Stack ---\n${stack}`;
                throw error;
            }

            if (result.base64 === null || result.headers === null) {
                throw new Error(`Invalid response from page context for ${url}. Missing base64 or headers.`);
            }

            return {
                base64: result.base64,
                headers: result.headers,
                status: result.status,
                statusText: result.statusText,
                finalUrl: result.finalUrl,
            };
        } catch (e: any) {
            if (this.fetcher) {
                try {
                    const response = await this.fetcher(url);
                    if (!response.ok) {
                        throw new Error(`Fallback fetcher failed with status ${response.status} for ${url}`);
                    }
                    const buffer = await response.arrayBuffer();
                    const base64 = Buffer.from(buffer).toString('base64');
                    const headers: Record<string, string> = {};
                    response.headers.forEach((value, key) => {
                        headers[key] = value;
                    });

                    return {
                        base64,
                        headers,
                        status: response.status,
                        statusText: response.statusText,
                        finalUrl: response.url,
                    };
                } catch {
                    throw e;
                }
            }

            throw e;
        }
    }

    public async fetchResourceAsData(url: string): Promise<Response> {
        const result = await this.fetchAndEvaluateResource(url);
        const body = Buffer.from(result.base64, 'base64');

        return new CachedResponse(
            body,
            {
                status: result.status,
                statusText: result.statusText,
                headers: result.headers,
            },
            result.finalUrl
        );
    }

    public async fetchResourceAsDataWithCache(url: string, ttl = 3600 * 1000): Promise<Response> {
        if (!this.cache) {
            return this.fetchResourceAsData(url);
        }

        const cacheKey = `resource-fetch:${url}`;
        const cached = await this.cache.get<PageFetchResult>(cacheKey);

        if (cached) {
            const body = Buffer.from(cached.base64, 'base64');
            return new CachedResponse(
                body,
                { status: cached.status, statusText: cached.statusText, headers: cached.headers },
                cached.finalUrl
            );
        }

        const result = await this.fetchAndEvaluateResource(url);

        if (result.status >= 200 && result.status < 400) {
            await this.cache.set(cacheKey, result, ttl);
        }

        const body = Buffer.from(result.base64, 'base64');
        return new CachedResponse(
            body,
            { status: result.status, statusText: result.statusText, headers: result.headers },
            result.finalUrl
        );
    }

    public async interactAndScreenshotElement(
        elementHandle: ElementHandle,
        interaction: 'hover' | 'click',
        elementName: string
    ): Promise<string> {
        if (interaction === 'hover') {
            await elementHandle.hover();
        } else {
            await elementHandle.click({ delay: 50 });
        }

        await new Promise(resolve => setTimeout(resolve, 300));

        const boundingBox = await elementHandle.boundingBox();
        if (!boundingBox || boundingBox.width <= 0 || boundingBox.height <= 0) {
            throw new Error(`Element '${elementName}' has no valid bounding box or is not visible after interaction.`);
        }

        const screenshotBuffer = await this.page.screenshot({
            clip: {
                x: boundingBox.x,
                y: boundingBox.y,
                width: Math.ceil(boundingBox.width),
                height: Math.ceil(boundingBox.height),
            },
            encoding: 'base64',
        });

        if (!screenshotBuffer) {
            throw new Error(`Screenshot failed for element '${elementName}'.`);
        }

        const base64 = typeof screenshotBuffer === 'string'
            ? screenshotBuffer
            : Buffer.from(screenshotBuffer).toString('base64');

        return `data:image/png;base64,${base64}`;
    }

    async close(): Promise<void> {
        await this.page.close();
    }
}
