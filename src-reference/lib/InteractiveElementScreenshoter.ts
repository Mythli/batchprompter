import { ElementHandle, Page } from 'puppeteer';
import sharp from 'sharp';
import { PuppeteerHelper } from './PuppeteerHelper.js';
import { PuppeteerPageHelper } from './PupeteerPageHelper.js';

/**
 * Creates a pseudo-random number generator.
 * @param a The seed.
 * @returns A function that returns a random number between 0 and 1.
 */
function mulberry32(a: number) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

/**
 * Describes a single screenshot of an element in a specific state.
 */
export interface ElementScreenshot {
    type: 'button' | 'input' | 'link';
    state: 'normal' | 'hover' | 'focus';
    screenshotBase64: string; // data:image/png;base64,...
    elementIndex: number; // To group states of the same element
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
export class InteractiveElementScreenshoter {
    constructor(private puppeteerHelper: PuppeteerHelper) {}

    /**
     * Takes screenshots of interactive elements on a page.
     * @param target A URL string to navigate to, or an existing PuppeteerPageHelper instance.
     * @param options Configuration for the screenshot process.
     * @returns A promise that resolves to an object containing individual screenshots and an optional composite image.
     */
    public async screenshot(
        target: string | PuppeteerPageHelper,
        options: ScreenshoterOptions = {}
    ): Promise<InteractiveElementsResult> {
        const {
            maxButtons = 3,
            maxInputs = 3,
            maxLinks = 3,
            createCompositeImage = true,
            seed = 12345, // Default seed for reproducibility
            scopeSelector,
        } = options;

        const prng = mulberry32(seed);

        let pageHelper: PuppeteerPageHelper;
        const shouldClosePageHelper = typeof target === 'string';

        if (shouldClosePageHelper) {
            pageHelper = await this.puppeteerHelper.getPageHelper();
            await pageHelper.navigateToUrl(target as string);
            // Wait a moment for dynamic content to load on the page.
            console.log('[Screenshoter] Waiting for 2 seconds for dynamic content to load...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
            pageHelper = target as PuppeteerPageHelper;
        }

        let scopeHandle: ElementHandle | null = null;
        try {
            const page = pageHelper.getPage();
            // Set a large viewport to try and get all elements into view
            await page.setViewport({ width: 1920, height: 10000 });
            console.log('[Screenshoter] Set viewport to 1920x10000.');

            let searchContext: Page | ElementHandle = page;
            if (scopeSelector) {
                console.log(`[Screenshoter] Scoping search to selector: ${scopeSelector}`);
                scopeHandle = await page.$(scopeSelector);
                if (!scopeHandle) {
                    console.warn(`[Screenshoter] Scope selector "${scopeSelector}" did not match any element. Searching entire page.`);
                } else {
                    searchContext = scopeHandle;
                }
            }

            const allScreenshots: ElementScreenshot[] = [];

            // --- Buttons ---
            const buttonHandles = await this.getRandomElements(searchContext, 'button, [role="button"], input[type="submit"], input[type="button"], a[class*="button"], a[class*="btn"]', maxButtons, 'button', prng);
            for (const [i, handle] of buttonHandles.entries()) {
                await this.processElement(pageHelper, handle, 'button', i + 1, ['normal', 'hover'], allScreenshots);
            }

            // --- Inputs ---
            const inputHandles = await this.getRandomElements(searchContext, 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea', maxInputs, 'input', prng);
            for (const [i, handle] of inputHandles.entries()) {
                await this.processElement(pageHelper, handle, 'input', i + 1, ['normal', 'hover', 'focus'], allScreenshots);
            }

            // --- Links ---
            const linkHandles = await this.getRandomElements(searchContext, 'a[href]:not([class*="button"]):not([class*="btn"])', maxLinks, 'link', prng);
            for (const [i, handle] of linkHandles.entries()) {
                await this.processElement(pageHelper, handle, 'link', i + 1, ['normal', 'hover'], allScreenshots);
            }

            let compositeImageBase64: string | undefined;
            if (createCompositeImage && allScreenshots.length > 0) {
                compositeImageBase64 = await this.createCompositeImage(allScreenshots);
            }

            return {
                screenshots: allScreenshots,
                compositeImageBase64,
            };
        } finally {
            if (scopeHandle) {
                await scopeHandle.dispose();
            }
            if (shouldClosePageHelper) {
                await pageHelper.close();
            }
        }
    }

    private async processElement(pageHelper: PuppeteerPageHelper, handle: ElementHandle, type: ElementScreenshot['type'], elementIndex: number, states: ElementScreenshot['state'][], allScreenshots: ElementScreenshot[]) {
        try {
            for (const state of states) {
                const shot = await this.screenshotElementState(pageHelper, handle, state, type, elementIndex);
                if (shot) {
                    allScreenshots.push(shot);
                }
            }
        } catch (e) {
            console.warn(`[Screenshoter] Could not process element ${type} #${elementIndex}: ${(e as Error).message}`);
        } finally {
            await handle.dispose();
        }
    }

    private async screenshotElementState(pageHelper: PuppeteerPageHelper, handle: ElementHandle, state: ElementScreenshot['state'], type: ElementScreenshot['type'], elementIndex: number): Promise<ElementScreenshot | null> {
        try {
            const elementName = `${type} #${elementIndex} (${state})`;
            const page = pageHelper.getPage();

            // Reset mouse to avoid lingering hover states from previous screenshots
            await page.mouse.move(0, 0);
            await new Promise(resolve => setTimeout(resolve, 50));

            // Perform interaction based on state
            if (state === 'hover') {
                await handle.hover();
                await new Promise(resolve => setTimeout(resolve, 200)); // Wait for hover effect
            } else if (state === 'focus') {
                // Using 'evaluate' to focus is often more reliable than handle.focus()
                await handle.evaluate(el => (el as HTMLElement).focus());
                await new Promise(resolve => setTimeout(resolve, 200)); // Wait for focus effect
            }

            // Get computed styles after interaction, filtering out browser defaults.
            const styles = await handle.evaluate(el => {
                // We need a default element to compare against. It must be in the DOM
                // to have computed styles. We use the same tag name.
                const defaultEl = document.createElement(el.tagName);
                document.body.appendChild(defaultEl);
                const defaultStyles = window.getComputedStyle(defaultEl);
                const elementStyles = window.getComputedStyle(el);
                const styleEntries = [];

                for (const propName of elementStyles) {
                    const value = elementStyles.getPropertyValue(propName);
                    const defaultValue = defaultStyles.getPropertyValue(propName);

                    // We only keep the style if it's different from the default value
                    // for an element of the same type. This filters out a lot of noise.
                    if (value !== defaultValue) {
                        styleEntries.push(`${propName}: ${value};`);
                    }
                }

                // Clean up by removing the temporary element from the DOM.
                document.body.removeChild(defaultEl);

                return styleEntries.join('\n');
            });

            // Get the bounding box of the element. This will be null if the element is not visible.
            const boundingBox = await handle.boundingBox();

            if (!boundingBox) {
                console.warn(`[Screenshoter] Could not get bounding box for '${elementName}'. Element might not be visible.`);
                return null;
            }

            // Ensure the box has a size.
            if (boundingBox.width === 0 || boundingBox.height === 0) {
                console.warn(`[Screenshoter] Bounding box for '${elementName}' has zero width or height.`);
                return null;
            }

            const PADDING = 30;
            const viewport = page.viewport();
            if (!viewport) {
                throw new Error("Could not get page viewport.");
            }

            const clip = {
                x: Math.max(0, boundingBox.x - PADDING),
                y: Math.max(0, boundingBox.y - PADDING),
                width: boundingBox.width + 2 * PADDING,
                height: boundingBox.height + 2 * PADDING,
            };

            // Adjust width and height to not exceed viewport boundaries
            if (clip.x + clip.width > viewport.width) {
                clip.width = viewport.width - clip.x;
            }
            if (clip.y + clip.height > viewport.height) {
                clip.height = viewport.height - clip.y;
            }

            const buffer = await page.screenshot({
                encoding: 'base64',
                clip: clip,
            });

            if (!buffer) {
                throw new Error(`Screenshot returned empty buffer for '${elementName}'.`);
            }
            const screenshotBase64 = `data:image/png;base64,${buffer}`;

            return { type, state, screenshotBase64, elementIndex, styles };
        } catch (e) {
            console.warn(`[Screenshoter] Could not screenshot ${type} #${elementIndex} in ${state} state: ${(e as Error).message}`);
            return null;
        }
    }

    private async getRandomElements(searchContext: Page | ElementHandle, selector: string, maxCount: number, type: 'button' | 'link' | 'input', prng: () => number): Promise<ElementHandle[]> {
        if (maxCount <= 0) return [];

        console.log(`[Screenshoter] Searching for up to ${maxCount} random elements with selector: ${selector}`);
        const allHandles = await searchContext.$$(selector);
        const validHandles: ElementHandle[] = [];

        for (const handle of allHandles) {
            try {
                // Check 1: Element must be visible in the DOM (not display:none) and have dimensions.
                const box = await handle.boundingBox();
                if (!box || box.width <= 10 || box.height <= 10) {
                    await handle.dispose();
                    continue;
                }

                // Check 2: Element must be intersecting the viewport.
                if (!(await handle.isIntersectingViewport())) {
                    await handle.dispose();
                    continue;
                }

                // Check 3: For buttons and links, apply additional filtering.
                if (type === 'button' || type === 'link') {
                    // Sub-check A: Must contain short, reasonable text.
                    const text = await handle.evaluate(node => node.textContent?.trim());
                    // Ensure text exists, is not too short, and is not too long to avoid capturing large clickable blocks.
                    if (!text || text.length < 3 || text.length > 50) {
                        await handle.dispose();
                        continue;
                    }

                    // Sub-check B: To avoid complex components, ensure any descendant elements are only SPANs.
                    const hasOnlySpanDescendants = await handle.evaluate(node => {
                        // Select all descendant elements.
                        const allDescendants = node.querySelectorAll('*');
                        for (const descendant of allDescendants) {
                            // If any descendant is not a SPAN, this element is considered complex.
                            if (descendant.tagName.toLowerCase() !== 'span') {
                                return false;
                            }
                        }
                        return true; // It's a simple element.
                    });

                    if (!hasOnlySpanDescendants) {
                        await handle.dispose();
                        continue;
                    }
                }

                validHandles.push(handle);

            } catch (e) {
                // This can happen if the element gets detached from the DOM during iteration.
                await handle.dispose();
            }
        }

        console.log(`[Screenshoter] Found ${validHandles.length} valid elements for selector.`);

        // Shuffle the valid handles to get random ones
        for (let i = validHandles.length - 1; i > 0; i--) {
            const j = Math.floor(prng() * (i + 1));
            const handleI = validHandles[i];
            const handleJ = validHandles[j];
            if (handleI && handleJ) {
                validHandles[i] = handleJ;
                validHandles[j] = handleI;
            }
        }

        const selectedHandles = validHandles.slice(0, maxCount);
        const unusedHandles = validHandles.slice(maxCount);
        for (const handle of unusedHandles) {
            await handle.dispose();
        }

        console.log(`[Screenshoter] Selected ${selectedHandles.length} random elements.`);
        return selectedHandles;
    }

    private async createCompositeImage(screenshots: ElementScreenshot[]): Promise<string> {
        const PADDING = 20;
        const LABEL_HEIGHT = 40;
        const BG_COLOR = '#f0f0f0';

        // Group screenshots by element type and index
        const groupedScreenshots = new Map<string, ElementScreenshot[]>();
        for (const screenshot of screenshots) {
            const key = `${screenshot.type}-${screenshot.elementIndex}`;
            if (!groupedScreenshots.has(key)) {
                groupedScreenshots.set(key, []);
            }
            groupedScreenshots.get(key)!.push(screenshot);
        }

        const compositeElements: sharp.OverlayOptions[] = [];
        let totalHeight = PADDING;
        let maxWidth = 0;

        // Process each group of elements (each group will be a row)
        for (const group of groupedScreenshots.values()) {
            const imageBuffers = group.map(s => Buffer.from(s.screenshotBase64.split(',')[1] ?? '', 'base64'));
            const metadata = await Promise.all(imageBuffers.map(b => sharp(b).metadata()));

            let currentX = PADDING;
            let rowMaxHeight = 0;
            const rowElements: sharp.OverlayOptions[] = [];

            // Layout elements horizontally in the row
            for (let i = 0; i < group.length; i++) {
                const screenshot = group[i];
                const meta = metadata[i];
                const imageBuffer = imageBuffers[i];

                if (!screenshot || !meta || !meta.width || !meta.height || !imageBuffer) {
                    continue;
                }

                const labelText = `${screenshot.type} ${screenshot.elementIndex} - ${screenshot.state}`;
                // Estimate label width: 9px per character for a 16px font, plus 10px for padding.
                const estimatedLabelWidth = (labelText.length * 9) + 10;
                const columnWidth = Math.max(meta.width, estimatedLabelWidth);

                const labelSvg = `
                    <svg width="${columnWidth}" height="${LABEL_HEIGHT}">
                        <style>
                            .title { fill: #333; font-size: 16px; font-family: sans-serif; text-transform: capitalize; }
                        </style>
                        <text x="5" y="25" class="title">${labelText}</text>
                    </svg>
                `;
                const labelBuffer = Buffer.from(labelSvg);

                // Add label
                rowElements.push({
                    input: labelBuffer,
                    top: totalHeight,
                    left: currentX,
                });

                // Center the screenshot horizontally within its column
                const screenshotLeftOffset = Math.floor((columnWidth - meta.width) / 2);

                // Add screenshot image below the label
                rowElements.push({
                    input: imageBuffer,
                    top: totalHeight + LABEL_HEIGHT,
                    left: currentX + screenshotLeftOffset,
                });

                currentX += columnWidth + PADDING;
                if (meta.height > rowMaxHeight) {
                    rowMaxHeight = meta.height;
                }
            }

            if (rowElements.length > 0) {
                compositeElements.push(...rowElements);
                totalHeight += LABEL_HEIGHT + rowMaxHeight + PADDING;
                if (currentX > maxWidth) {
                    maxWidth = currentX;
                }
            }
        }

        if (compositeElements.length === 0) return '';

        const finalWidth = maxWidth; // maxWidth already includes right padding

        const compositeImage = await sharp({
            create: {
                width: finalWidth,
                height: totalHeight,
                channels: 4,
                background: BG_COLOR,
            }
        })
        .composite(compositeElements)
        .png()
        .toBuffer();

        return `data:image/png;base64,${compositeImage.toString('base64')}`;
    }
}
