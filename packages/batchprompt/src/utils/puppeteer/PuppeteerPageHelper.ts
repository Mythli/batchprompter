import {Page, CDPSession, Viewport, HTTPResponse, ElementHandle, Protocol, HTTPRequest} from 'puppeteer';
import { Cache } from 'cache-manager';
import browserScriptFunction from './drawPuppeteerGrid.js';
import {CachedResponse, Fetcher} from "llm-fns";
import TurndownService from 'turndown';
import { compressHtml } from '../compressHtml.js';

/** Defines the viewport dimensions for a screenshot. */
export interface Resolution {
    width: number;
    height: number;
}

/** Contains the data for a single screenshot at a specific resolution. */
export interface ScreenshotData {
    resolution: Resolution;
    /** Full Data URL for the screenshot (e.g., "data:image/jpeg;base64,..."). */
    screenshotBase64: string;
}

/** Represents a hyperlink found on a page. */
export interface LinkData {
    href: string;
    text: string;
}

/** Options for controlling basic navigation behavior. */
export interface PageNavigationOptions {
    /** Whether to dismiss cookie banners after navigation. Defaults to true. */
    dismissCookies?: boolean;
    /**
     * If true, enables "HTML-only" mode for this navigation, blocking non-essential
     * resources like images and fonts to speed up the load. The mode is automatically
     * disabled after navigation completes. Defaults to false.
     */
    htmlOnly?: boolean;
    /** An optional viewport resolution to set before navigation. */
    resolution?: Resolution;
}

/** Options for the navigateAndCache method. */
export interface NavigateAndCacheOptions extends PageNavigationOptions {
    /** A unique key for caching. Defaults to the URL. */
    cacheKey?: string;
    /** Cache time-to-live in milliseconds. Defaults to 1 hour. */
    ttl?: number;
    /** An optional async function to run before navigation. */
    beforeNavigate?: (pageHelper: PuppeteerPageHelper) => Promise<void>;
    /** An optional async function to run after navigation but before the main action. */
    afterNavigate?: (pageHelper: PuppeteerPageHelper) => Promise<void>;
    /**
     * If true, the page will be closed after the operation is complete.
     * This is only honored by methods that encapsulate a full action, like `navigateAndCache`.
     * Defaults to false.
     */
    closePage?: boolean;
}

/**
 * Attempts to find and click cookie consent banners on a given page.
 *
 * This function searches for clickable elements (`button`, `a`, `[role="button"]`)
 * that contain common consent-related keywords in English and German. It's designed
 * to be a "best-effort" tool and may not work on all sites.
 *
 * @param page The Puppeteer Page object to interact with.
 */
export async function dismissCookieBanners(page: Page): Promise<void> {
    // A regular expression to find common keywords in English and German.
    const keywords = /accept|agree|consent|allow|got it|i understand|akzeptieren|zustimmen|einverstanden|erlauben|zulassen|verstanden|schliessen|schließen|close/i;

    let bannerClicked = false;
    console.log('Searching for all cookie banners to dismiss...');

    // Find all potential clickable elements on the page first.
    const clickableElements = await page.$$('button, a, [role="button"]');

    for (const element of clickableElements) {
        // Wrap each element interaction in its own try/catch block.
        try {
            const text = await element.evaluate(node => node.textContent?.trim() ?? '');

            if (keywords.test(text)) {
                if (await element.isIntersectingViewport()) {
                    console.log(`Found potential cookie button with text: "${text}". Clicking...`);
                    await element.click();
                    bannerClicked = true;
                }
            }
        } catch (error: any) {
            if (error.message.includes('Node is detached from the DOM')) {
                console.log('Skipping an element that disappeared after a previous click.');
            } else {
                console.warn(`An error occurred while clicking an element, but continuing search: ${error.message}`);
            }
        }
    }

    if (bannerClicked) {
        console.log('Finished attempting all clicks. Waiting for animations to complete...');
        await new Promise(resolve => setTimeout(resolve, 250));
    } else {
        console.log('No actionable cookie banners were found.');
    }
}

type PageFetchResult = {
    base64: string;
    headers: Record<string, string>;
    status: number;
    statusText: string;
    finalUrl: string;
};

export interface ScrapedPageContent {
    html: string;
    markdown: string;
    links: LinkData[];
}

/**
 * A helper class providing utility methods to interact with and extract data from a Puppeteer Page.
 */
export class PuppeteerPageHelper {
    private page: Page;
    private client: CDPSession | null = null;
    private collectedStylesheets: { url: string, content: string }[] = [];
    private cssPromises: Promise<void>[] = [];
    private cache?: Cache;
    private isInterceptionEnabled = false;
    private fetcher?: Fetcher;

    private requestHandler = (request: HTTPRequest) => {
        if (['stylesheet', 'font', 'image', 'media'].includes(request.resourceType())) {
            request.abort().catch(e => console.warn(`Could not abort request ${request.url()}: ${e.message}`));
        } else {
            request.continue().catch(e => console.warn(`Could not continue request ${request.url()}: ${e.message}`));
        }
    };

    constructor(page: Page, blocker: null, cache?: Cache, fetcher?: Fetcher) {
        this.page = page;
        this.cache = cache;
        this.fetcher = fetcher;
    }

    /**
     * Returns the underlying Puppeteer Page object.
     */
    public getPage(): Page {
        return this.page;
    }

    /**
     * Enables "HTML-only" mode by blocking non-essential resources like images,
     * stylesheets, and fonts. This can significantly speed up page loads when
     * only the HTML content is required for processing.
     */
    public async enableHtmlMode(): Promise<void> {
        if (this.isInterceptionEnabled) {
            return; // Already enabled
        }
        this.page.on('request', this.requestHandler);
        await this.page.setRequestInterception(true);
        this.isInterceptionEnabled = true;
        console.log('HTML-only mode enabled. Blocking non-essential resources.');
    }

    /**
     * Prepares the page for scraping by enabling the ad blocker and setting user agent.
     * This is now called automatically when a helper is created via PuppeteerHelper.
     */
    async setupPage(): Promise<void> {
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        // Automatically dismiss dialogs (alerts, confirms, beforeunload)
        this.page.on('dialog', async (dialog) => {
            console.log(`[Puppeteer] Dismissing dialog: ${dialog.message()}`);
            await dialog.dismiss();
        });

        // Set a default viewport to avoid repaints and ensure consistency.
        await this.page.setViewport({ width: 1920, height: 1080 });
        await this.startCssExtraction();
    }

    /**
     * Initializes CSS extraction. This must be called before navigating or setting content
     * to capture all stylesheets.
     */
    async startCssExtraction(): Promise<void> {
        this.client = await this.page.createCDPSession();
        await this.client.send('DOM.enable');
        await this.client.send('CSS.enable');

        this.client.on('CSS.styleSheetAdded', async (event) => {
            const { header } = event;
            const promise = (async () => {
                try {
                    const { text } = await this.client!.send('CSS.getStyleSheetText', {
                        styleSheetId: header.styleSheetId,
                    });
                    this.collectedStylesheets.push({
                        url: header.sourceURL || `inline-style-${header.styleSheetId}`,
                        content: text,
                    });
                } catch (e: any) {
                    console.warn(`Could not get CSS text for stylesheet ${header.sourceURL || header.styleSheetId}: ${e.message}`);
                }
            })();
            this.cssPromises.push(promise);
        });
    }

    /**
     * Navigates the page to a given URL and dismisses cookie banners.
     * `startCssExtraction` should be called before this method.
     * @param url The URL to navigate to.
     * @returns The original HTML of the page before JavaScript execution.
     */
    async navigateToUrlAndGetHtml(url: string, options: PageNavigationOptions = {}): Promise<string> {
        const response = await this.navigateToUrl(url, options);
        if (!response) {
            console.warn(`[PuppeteerPageHelper] Navigation to ${url} did not return a response (likely timeout). Returning current page content.`);
            return this.getFinalHtml();
        }
        try {
            const originalHtml = await response.text();
            return originalHtml;
        } catch (e) {
            console.warn(`[PuppeteerPageHelper] Could not get text from response. Returning current page content.`);
            return this.getFinalHtml();
        }
    }

    async navigateToUrl(url: string, options: PageNavigationOptions = {}) {
        const { dismissCookies = false, htmlOnly = false, resolution } = options;

        try {
            if (resolution) {
                const currentViewport = this.page.viewport();
                if (!currentViewport || currentViewport.width !== resolution.width || currentViewport.height !== resolution.height) {
                    console.log(`Setting viewport to ${resolution.width}x${resolution.height}`);
                    await this.page.setViewport(resolution as Viewport);
                }
            }

            if (htmlOnly) {
                await this.enableHtmlMode();
            }
            console.log(`Navigating to URL: ${url}`);
            const response = await this.page.goto(url, {waitUntil: 'networkidle0', timeout: htmlOnly ? 10000 : 30000});
            // if (!response) {
            //     throw new Error(`Failed to get a response from ${url}`);
            // }

            if (dismissCookies) {
                await dismissCookieBanners(this.page);
            }
            return response;
        }
        catch(error: any) {
            if(error.name === 'TimeoutError') {
                console.warn(`[PuppeteerPageHelper] Navigation timeout for ${url}: ${error.message}`);
                return null;
            } else {
                throw error;
            }
        }
    }

    /**
     * Navigates to a URL and executes a provided function, caching the result.
     * If a cached result exists for the given key, it's returned directly without
     * navigation or executing the function.
     *
     * @param url The URL to navigate to.
     * @param action The async function to execute after navigation. It receives the page helper instance.
     * @param options Optional parameters for caching and execution.
     * @returns The result of the action function, either from cache or by executing it.
     */
    async navigateAndCache<T>(
        url: string,
        action: (pageHelper: PuppeteerPageHelper) => Promise<T>,
        options: NavigateAndCacheOptions = {}
    ): Promise<T> {
        const { cacheKey = url, ttl = 3600 * 1000, beforeNavigate, afterNavigate, closePage = false, ...navOptions } = options;

        if (this.cache) {
            const cachedResult = await this.cache.get<T>(cacheKey);
            if (cachedResult) {
                console.log(`[Cache] HIT for key: ${cacheKey}`);
                // Do NOT navigate, just return the cached result.
                // The 'closePage' logic is handled in the finally block of the caller of this cache hit.
                // But if the caller of this wants the page closed, we should respect that.
                // This is tricky. The logic in scrapeSubsequentPages relies on this closing.
                // Let's adjust the logic slightly. If we hit the cache, we don't navigate,
                // but we still need to decide if we close the page helper instance.
                if (closePage) {
                    await this.close();
                }
                return cachedResult;
            }
            console.log(`[Cache] MISS for key: ${cacheKey}. Navigating and executing action.`);
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
                console.log(`[Cache] SET for key: ${cacheKey}`);
            }

            return result;
        } catch(error: any) {
            throw error;
        } finally {
            if (closePage) {
                await this.close();
                console.log('yeah');
            }
        }
    }

    /**
     * High-level helper to navigate to a URL, extract content, convert to Markdown,
     * and cache the result.
     */
    async scrapeUrl(url: string, options: NavigateAndCacheOptions = {}): Promise<ScrapedPageContent> {
        return this.navigateAndCache(
            url,
            async (ph) => ph.getProcessedContent(),
            options
        );
    }

    /**
     * Extracts HTML, converts to Markdown, and extracts links from the current page.
     */
    async getProcessedContent(): Promise<ScrapedPageContent> {
        const html = await this.getFinalHtml();
        const links = await this.extractLinksWithText();
        
        // Compression and Markdown conversion
        const compressed = compressHtml(html);
        const turndownService = new TurndownService();
        turndownService.remove(['script', 'style', 'noscript', 'iframe']);
        const markdown = turndownService.turndown(compressed);
        
        return { html, markdown, links };
    }

    /**
     * Ensures the page is at the specified URL, navigating only if necessary.
     * This is useful after a potential cache hit that prevented navigation.
     * @param url The URL the page should be at.
     * @param options Navigation options if a navigation is required.
     */
    public async ensurePageAtUrl(url: string, options: PageNavigationOptions = {}): Promise<void> {
        const currentPageUrl = this.page.url();
        const targetUrl = new URL(url);

        // The most critical check is for 'about:blank' which is the initial state.
        if (currentPageUrl === 'about:blank') {
            console.log(`[ensurePageAtUrl] Page is at about:blank, navigating to ${url}...`);
            await this.navigateToUrl(url, options);
            return;
        }

        // Check if the origin is different. This handles cases where we navigated to another site.
        // const currentUrl = new URL(currentPageUrl);
        // if (currentUrl.origin !== targetUrl.origin) {
        //     console.log(`[ensurePageAtUrl] Page is at a different origin (${currentUrl.origin}), navigating to ${url}...`);
        //     await this.navigateToUrl(url, options);
        //     return;
        // }
        //
        // console.log(`[ensurePageAtUrl] Page is already at a compatible URL: ${currentPageUrl}`);
    }

    /**
     * Sets the page content from an HTML string.
     * `startCssExtraction` should be called before this method.
     * @param html The HTML content to set.
     */
    async setHtmlContent(html: string): Promise<void> {
        console.log(`Setting page content from HTML...`);
        await this.page.setContent(html, { waitUntil: 'networkidle0' });
    }

    /**
     * Waits for all CSS to be collected and returns it as an array of objects,
     * each containing the stylesheet's URL and its content.
     * This should be called after navigation or content setting is complete.
     * @returns An array of stylesheet objects.
     */
    async getCss(): Promise<{ url: string, content: string }[]> {
        await Promise.all(this.cssPromises);
        return this.collectedStylesheets;
    }

    /**
     * Gets the final, rendered HTML content of the page.
     * Uses a timeout and fallback to prevent hanging indefinitely.
     * @param timeoutMs Max time to wait for content (default 15s).
     * @returns The page's full HTML content. Throws error if completely failed.
     */
    async getFinalHtml(timeoutMs: number = 15000): Promise<string> {
        try {
            // 1. Try the standard Puppeteer method with a timeout
            return await Promise.race([
                this.page.content(),
                new Promise<string>((_, reject) => 
                    setTimeout(() => reject(new Error(`Timeout of ${timeoutMs}ms exceeded`)), timeoutMs)
                )
            ]);
        } catch (e: any) {
            console.warn(`[PuppeteerPageHelper] page.content() failed or timed out: ${e.message}. Trying fallback JS evaluation.`);
            
            try {
                // 2. Fallback: Try to get HTML via JS evaluation.
                // This is often faster/lighter and might work if the CDP protocol is stuck.
                const html = await Promise.race([
                    this.page.evaluate(() => document.documentElement.outerHTML),
                    new Promise<string>((_, reject) => 
                        setTimeout(() => reject(new Error('Fallback JS evaluation timed out')), 5000)
                    )
                ]);
                return html as string;
            } catch (fallbackError: any) {
                console.error(`[PuppeteerPageHelper] Critical: Failed to get HTML content via fallback: ${fallbackError.message}`);
                // 3. Throw error to ensure the process moves on and doesn't hang.
                throw new Error(`Failed to get page content: ${fallbackError.message}`);
            }
        }
    }

    /**
     * Extracts all hyperlinks from the current page.
     * @returns A promise that resolves to an array of objects, each containing the `href` and cropped `text` of a link.
     */
    public async extractLinksWithText(): Promise<LinkData[]> {
        console.log('Extracting all links with anchor text from the page...');
        const links = await this.page.evaluate(() => {
            const linkData: { href: string; text: string; }[] = [];
            const anchors = Array.from(document.querySelectorAll('a'));
            for (const anchor of anchors) {
                const href = (anchor as HTMLAnchorElement).href;
                // Ensure the link is an absolute URL
                if (href && (href.startsWith('http:') || href.startsWith('https://'))) {
                    const text = (anchor.innerText || '').trim().substring(0, 200);
                    linkData.push({ href, text });
                }
            }
            return linkData;
        });
        return links;
    }

    /**
     * Takes screenshots of the page at various resolutions.
     * @param resolutions An array of resolutions for the screenshots.
     * @returns An array of screenshot data.
     */
    async takeScreenshots(resolutions: Resolution[]): Promise<ScreenshotData[]> {
        const screenshots: ScreenshotData[] = [];
        for (const resolution of resolutions) {
            const currentViewport = this.page.viewport();
            if (!currentViewport || currentViewport.width !== resolution.width || currentViewport.height !== resolution.height) {
                console.log(`Setting viewport to ${resolution.width}x${resolution.height}`);
                await this.page.setViewport(resolution as Viewport);
                await new Promise(resolve => setTimeout(resolve, 50)); // Wait for viewport to resize
            } else {
                console.log(`Viewport already at ${resolution.width}x${resolution.height}, not changing.`);
            }

            const screenshotBuffer = await this.page.screenshot({
                fullPage: true,
                type: 'jpeg',
                quality: 80,
            }) as Buffer;
            const screenshotBase64 = `data:image/jpeg;base64,${screenshotBuffer.toString('base64')}`;
            screenshots.push({ resolution, screenshotBase64 });
        }
        return screenshots;
    }

    public async drawGridOverlay(
    options: {
        gridSize?: number;
        minorGridSize?: number;
        color?: string;
    } = {}
): Promise<void> {
    const {
        gridSize = 50,
        minorGridSize = 25,
        color: majorLineColor = 'rgba(255, 0, 0, 0.5)',
    } = options;

    const minorLineColor = majorLineColor.replace(/, ?\d?\.?\d+\)$/, ', 0.15)');

    console.log(`Drawing grid overlay with major lines every ${gridSize}px and minor lines every ${minorGridSize}px.`);

    // 1. Get the string representation of the imported function.
    // This is the key step that avoids all serialization issues.
    const browserScriptAsString = browserScriptFunction.toString();

    // 2. Evaluate the script string in the browser, passing arguments.
    await this.page.evaluate(browserScriptFunction,
        gridSize,
        minorGridSize,
        majorLineColor,
        minorLineColor
    );
}

    private async _fetchAndEvaluateResource(url: string): Promise<PageFetchResult> {
        try {
            console.log(`Fetching resource in page context: ${url}`);
            const currentPageUrl = this.page.url();

            // This function runs in the browser context
            const result = await this.page.evaluate(async (resourceToFetchUrl, pageUrl) => {
                try {
                    // Use the page's URL as the base for resolving the resource URL.
                    // This correctly handles relative paths like '/images/logo.png'.
                    const resourceUrl = new URL(resourceToFetchUrl, pageUrl);
                    const pageOriginUrl = new URL(pageUrl);

                    // Heuristic to align origins for same-domain resources after redirects.
                    // This avoids CORS issues (e.g., http -> https) while leaving CDN links intact.
                    const resourceHost = resourceUrl.hostname.replace(/^www\./, '');
                    const pageHost = pageOriginUrl.hostname.replace(/^www\./, '');

                    let finalUrlToFetch;
                    if (resourceHost === pageHost) {
                        // Same domain: force the origin to match the current page.
                        finalUrlToFetch = new URL(
                            resourceUrl.pathname + resourceUrl.search + resourceUrl.hash,
                            pageOriginUrl.origin
                        ).href;
                    } else {
                        // Different domain (e.g., a CDN): use the resolved absolute URL.
                        finalUrlToFetch = resourceUrl.href;
                    }

                    const response = await fetch(finalUrlToFetch);

                    const headers: Record<string, string> = {};
                    response.headers.forEach((value, key) => {
                        headers[key] = value;
                    });

                    const buffer = await response.arrayBuffer();

                    // Convert ArrayBuffer to Base64
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
                        error: null, // Explicitly null on success
                    };
                } catch (e: any) {
                    // Capture more details from the error object for better debugging.
                    const errorDetails = {
                        name: e.name,
                        message: e.message,
                        stack: e.stack,
                    };
                    return {
                        error: errorDetails,
                        base64: null,
                        headers: null,
                        status: 0,
                        statusText: '',
                        finalUrl: resourceToFetchUrl
                    };
                }
            }, url, currentPageUrl);

            if (result.error) {
                const { name, message, stack } = result.error;
                const errorMessage = `Error fetching resource in page context for ${url}: [${name}] ${message}`;
                const error = new Error(errorMessage);
                // Augment the stack with the stack from the browser context for better debugging.
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
            console.warn(`[Fallback] Puppeteer fetch failed for ${url}. Reason: ${e.message}. Falling back to system fetcher.`);
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
                } catch (fallbackError: any) {
                    console.error(`[Fallback] System fetcher also failed for ${url}. Reason: ${fallbackError.message}`);
                    // Re-throw the original error to not mask the Puppeteer issue
                    throw e;
                }
            } else {
                console.error(`[Fallback] Puppeteer fetch failed, and no fallback fetcher is configured.`);
                throw e; // Re-throw original error
            }
        }
    }

    /**
     * Fetches a resource from within the page's context using `fetch`.
     * This is useful for bypassing CORS or reusing the browser's session.
     * The resource is returned as a `Response` object, compatible with native `fetch`.
     * @param url The URL of the resource to fetch.
     * @returns A promise that resolves to a `Response` object.
     */
    public async fetchResourceAsData(url: string): Promise<Response> {
        const result = await this._fetchAndEvaluateResource(url);
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

    /**
     * Fetches a resource from within the page's context, utilizing a cache to
     * avoid redundant requests.
     * @param url The URL of the resource to fetch.
     * @param ttl Optional. The time-to-live for the cache entry in milliseconds. Defaults to 1 hour.
     * @returns A promise that resolves to a `Response` object.
     */
    public async fetchResourceAsDataWithCache(url: string, ttl: number = 3600 * 1000): Promise<Response> {
        if (!this.cache) {
            return this.fetchResourceAsData(url);
        }

        const cacheKey = `resource-fetch:${url}`;
        const cached = await this.cache.get<PageFetchResult>(cacheKey);

        if (cached) {
            console.log(`[Cache] HIT for resource: ${url}`);
            const body = Buffer.from(cached.base64, 'base64');
            return new CachedResponse(
                body,
                { status: cached.status, statusText: cached.statusText, headers: cached.headers },
                cached.finalUrl
            );
        }

        console.log(`[Cache] MISS for resource: ${url}. Fetching...`);
        const result = await this._fetchAndEvaluateResource(url);

        // Only cache successful responses
        if (result.status >= 200 && result.status < 400) {
            await this.cache.set(cacheKey, result, ttl);
            console.log(`[Cache] SET for resource: ${url}`);
        }

        const body = Buffer.from(result.base64, 'base64');
        return new CachedResponse(
            body,
            { status: result.status, statusText: result.statusText, headers: result.headers },
            result.finalUrl
        );
    }

    /**
     * Performs an interaction on a given element and takes a screenshot of it.
     * This method will throw an error if the element is not visible or if the screenshot fails.
     * @param elementHandle The Puppeteer ElementHandle to interact with.
     * @param interaction The type of interaction to perform ('hover' or 'click').
     * @param elementName A descriptive name for the element for logging purposes.
     * @returns A base64 data URI of the screenshot.
     * @throws An error if the element is not visible or the screenshot fails.
     */
    public async interactAndScreenshotElement(
        elementHandle: ElementHandle,
        interaction: 'hover' | 'click',
        elementName: string
    ): Promise<string> {
        console.log(`Found a ${elementName}. Performing '${interaction}' and taking screenshot...`);

        if (interaction === 'hover') {
            await elementHandle.hover();
        } else {
            await elementHandle.click({ delay: 50 });
        }

        await new Promise(resolve => setTimeout(resolve, 300)); // wait for interaction effect and render

        // Get the bounding box *after* the interaction has brought it into view.
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
            encoding: 'base64'
        });

        if (!screenshotBuffer) {
            throw new Error(`Screenshot failed for element '${elementName}'.`);
        }

        return `data:image/png;base64,${screenshotBuffer}`;
    }

    /**
     * Cleans up the CDP session. Should be called before closing the page.
     */
    async cleanup(): Promise<void> {
        if (this.client) {
            try {
                await this.client.detach();
            } catch (detachError: any) {
                console.warn(`Error detaching CDP client: ${detachError.message}`);
            }
        }
    }

    async close(): Promise<void> {
        await this.cleanup();
        await this.page.close();
    }
}
