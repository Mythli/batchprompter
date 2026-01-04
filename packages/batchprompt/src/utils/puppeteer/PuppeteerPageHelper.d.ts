import { Page, HTTPResponse, ElementHandle } from 'puppeteer';
import { Cache } from 'cache-manager';
import { Fetcher } from "llm-fns";
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
export declare function dismissCookieBanners(page: Page): Promise<void>;
export interface ScrapedPageContent {
    html: string;
    markdown: string;
    links: LinkData[];
}
/**
 * A helper class providing utility methods to interact with and extract data from a Puppeteer Page.
 */
export declare class PuppeteerPageHelper {
    private page;
    private client;
    private collectedStylesheets;
    private cssPromises;
    private cache?;
    private isInterceptionEnabled;
    private fetcher?;
    private requestHandler;
    constructor(page: Page, blocker: null, cache?: Cache, fetcher?: Fetcher);
    /**
     * Returns the underlying Puppeteer Page object.
     */
    getPage(): Page;
    /**
     * Enables "HTML-only" mode by blocking non-essential resources like images,
     * stylesheets, and fonts. This can significantly speed up page loads when
     * only the HTML content is required for processing.
     */
    enableHtmlMode(): Promise<void>;
    /**
     * Prepares the page for scraping by enabling the ad blocker and setting user agent.
     * This is now called automatically when a helper is created via PuppeteerHelper.
     */
    setupPage(): Promise<void>;
    /**
     * Initializes CSS extraction. This must be called before navigating or setting content
     * to capture all stylesheets.
     */
    startCssExtraction(): Promise<void>;
    /**
     * Navigates the page to a given URL and dismisses cookie banners.
     * `startCssExtraction` should be called before this method.
     * @param url The URL to navigate to.
     * @returns The original HTML of the page before JavaScript execution.
     */
    navigateToUrlAndGetHtml(url: string, options?: PageNavigationOptions): Promise<string>;
    navigateToUrl(url: string, options?: PageNavigationOptions): Promise<HTTPResponse | null>;
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
    navigateAndCache<T>(url: string, action: (pageHelper: PuppeteerPageHelper) => Promise<T>, options?: NavigateAndCacheOptions): Promise<T>;
    /**
     * High-level helper to navigate to a URL, extract content, convert to Markdown,
     * and cache the result.
     */
    scrapeUrl(url: string, options?: NavigateAndCacheOptions): Promise<ScrapedPageContent>;
    /**
     * Extracts HTML, converts to Markdown, and extracts links from the current page.
     */
    getProcessedContent(): Promise<ScrapedPageContent>;
    /**
     * Ensures the page is at the specified URL, navigating only if necessary.
     * This is useful after a potential cache hit that prevented navigation.
     * @param url The URL the page should be at.
     * @param options Navigation options if a navigation is required.
     */
    ensurePageAtUrl(url: string, options?: PageNavigationOptions): Promise<void>;
    /**
     * Sets the page content from an HTML string.
     * `startCssExtraction` should be called before this method.
     * @param html The HTML content to set.
     */
    setHtmlContent(html: string): Promise<void>;
    /**
     * Waits for all CSS to be collected and returns it as an array of objects,
     * each containing the stylesheet's URL and its content.
     * This should be called after navigation or content setting is complete.
     * @returns An array of stylesheet objects.
     */
    getCss(): Promise<{
        url: string;
        content: string;
    }[]>;
    /**
     * Gets the final, rendered HTML content of the page.
     * Uses a timeout and fallback to prevent hanging indefinitely.
     * @param timeoutMs Max time to wait for content (default 15s).
     * @returns The page's full HTML content. Throws error if completely failed.
     */
    getFinalHtml(timeoutMs?: number): Promise<string>;
    /**
     * Extracts all hyperlinks from the current page.
     * @returns A promise that resolves to an array of objects, each containing the `href` and cropped `text` of a link.
     */
    extractLinksWithText(): Promise<LinkData[]>;
    /**
     * Takes screenshots of the page at various resolutions.
     * @param resolutions An array of resolutions for the screenshots.
     * @returns An array of screenshot data.
     */
    takeScreenshots(resolutions: Resolution[]): Promise<ScreenshotData[]>;
    drawGridOverlay(options?: {
        gridSize?: number;
        minorGridSize?: number;
        color?: string;
    }): Promise<void>;
    private _fetchAndEvaluateResource;
    /**
     * Fetches a resource from within the page's context using `fetch`.
     * This is useful for bypassing CORS or reusing the browser's session.
     * The resource is returned as a `Response` object, compatible with native `fetch`.
     * @param url The URL of the resource to fetch.
     * @returns A promise that resolves to a `Response` object.
     */
    fetchResourceAsData(url: string): Promise<Response>;
    /**
     * Fetches a resource from within the page's context, utilizing a cache to
     * avoid redundant requests.
     * @param url The URL of the resource to fetch.
     * @param ttl Optional. The time-to-live for the cache entry in milliseconds. Defaults to 1 hour.
     * @returns A promise that resolves to a `Response` object.
     */
    fetchResourceAsDataWithCache(url: string, ttl?: number): Promise<Response>;
    /**
     * Performs an interaction on a given element and takes a screenshot of it.
     * This method will throw an error if the element is not visible or if the screenshot fails.
     * @param elementHandle The Puppeteer ElementHandle to interact with.
     * @param interaction The type of interaction to perform ('hover' or 'click').
     * @param elementName A descriptive name for the element for logging purposes.
     * @returns A base64 data URI of the screenshot.
     * @throws An error if the element is not visible or the screenshot fails.
     */
    interactAndScreenshotElement(elementHandle: ElementHandle, interaction: 'hover' | 'click', elementName: string): Promise<string>;
    /**
     * Cleans up the CDP session. Should be called before closing the page.
     */
    cleanup(): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=PuppeteerPageHelper.d.ts.map