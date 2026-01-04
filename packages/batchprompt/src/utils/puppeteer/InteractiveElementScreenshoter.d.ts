import { PuppeteerHelper } from './PuppeteerHelper.js';
import { PuppeteerPageHelper } from './PuppeteerPageHelper.js';
/**
 * Describes a single screenshot of an element in a specific state.
 */
export interface ElementScreenshot {
    type: 'button' | 'input' | 'link';
    state: 'normal' | 'hover' | 'focus';
    screenshotBase64: string;
    elementIndex: number;
    /** The computed CSS styles of the element for the given state. */
    styles: string;
}
/**
 * The result of the screenshotting process for a single URL.
 */
export interface InteractiveElementsResult {
    /** An array of all individual screenshots taken. */
    screenshots: ElementScreenshot[];
    /** A single composite image (collage) of all screenshots with labels. */
    compositeImageBase64?: string;
}
/**
 * Configuration options for the InteractiveElementScreenshoter.
 */
export interface ScreenshoterOptions {
    maxButtons?: number;
    maxInputs?: number;
    maxLinks?: number;
    createCompositeImage?: boolean;
    /** A seed for the pseudo-random number generator to ensure reproducible results. */
    seed?: number;
    /** An optional selector to scope the element search to the first matching element. */
    scopeSelector?: string;
}
/**
 * A class to find, interact with, and screenshot various interactive elements on a page.
 */
export declare class InteractiveElementScreenshoter {
    private puppeteerHelper;
    constructor(puppeteerHelper: PuppeteerHelper);
    /**
     * Takes screenshots of interactive elements on a page.
     * @param target A URL string to navigate to, or an existing PuppeteerPageHelper instance.
     * @param options Configuration for the screenshot process.
     * @returns A promise that resolves to an object containing individual screenshots and an optional composite image.
     */
    screenshot(target: string | PuppeteerPageHelper, options?: ScreenshoterOptions): Promise<InteractiveElementsResult>;
    private processElement;
    private screenshotElementState;
    private getRandomElements;
    private createCompositeImage;
}
//# sourceMappingURL=InteractiveElementScreenshoter.d.ts.map