/*
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {PuppeteerHelper} from "../lib/PuppeteerHelper.js";
import {Resolution, ScreenshotData} from "../lib/PupeteerPageHelper.js";

/!**
 * Defines the dependencies required by the render page route.
 * @property {Hono<any>} app - The Hono application instance.
 * @property {WebPageScraper} scraper - A pre-initialized WebPageScraper instance.
 *!/
export interface RenderPageDependencies {
    app: Hono<any>;
    puppeteerHelper: PuppeteerHelper;
}

/!**
 * Helper function to generate the final HTML response. (Unchanged)
 *!/
function _generateHtmlResponse(url: string, desktopShot: ScreenshotData, mobileShot: ScreenshotData): string {

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Rendered Page: ${url}</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f0f2f5; margin: 0; padding: 2rem; color: #1c1e21; }
                h1, h2 { color: #333; text-align: center; }
                h1 { font-size: 1.8rem; word-break: break-all; margin-bottom: 2rem; }
                h2 { margin-top: 2rem; border-bottom: 2px solid #ddd; padding-bottom: 0.5rem; }
                .screenshot-wrapper { display: flex; justify-content: center; align-items: flex-start; gap: 2rem; flex-wrap: wrap; }
                .screenshot-container { border: 1px solid #ccc; border-radius: 8px; box-shadow: 0 6px 12px rgba(0,0,0,0.1); background-color: white; padding: 1rem; overflow: hidden; }
                .screenshot-container h3 { margin-top: 0; text-align: center; }
                img { display: block; max-width: 100%; height: auto; border: 1px solid #eee; }
                #desktop-container img { max-width: 800px; }
                #mobile-container img { max-width: 320px; }
            </style>
        </head>
        <body>
            <h1>Rendered Screenshots for: ${url}</h1>
            <div class="screenshot-wrapper">
                <div id="desktop-container" class="screenshot-container">
                    <h3>Desktop (${desktopShot.resolution.width}x${desktopShot.resolution.height})</h3>
                    <img src="${desktopShot.screenshotBase64}" alt="Desktop screenshot of ${url}">
                </div>

                <div id="mobile-container" class="screenshot-container">
                    <h3>Mobile (${mobileShot.resolution.width}x${mobileShot.resolution.height})</h3>
                    <img src="${mobileShot.screenshotBase64}" alt="Mobile screenshot of ${url}">
                </div>
            </div>
        </body>
        </html>
    `;
}

// Define a Zod schema for input validation.
const screenshotPageSchema = z.object({
    url: z.string().url({ message: "Invalid URL format" }),
});

/!**
 * Registers the /render-page route with the Hono application.
 * This function now accepts a pre-initialized scraper instance.
 * @param {RenderPageDependencies} deps - The dependencies for this route.
 *!/
export function registerScreenshotPage(deps: RenderPageDependencies): void {
    const { app, puppeteerHelper } = deps; // Destructure the scraper from dependencies

    app.get('/screenshot-page', zValidator('query', screenshotPageSchema), async (c) => {
        const input = c.req.valid('query');

        try {
            // The scraper is already initialized. We just use it.
            const desktopResolution: Resolution = { width: 1920, height: 1080 };
            const mobileResolution: Resolution = { width: 390, height: 844 };

            console.log(`Rendering screenshots for ${input.url}...`);
            const pageHelper = await puppeteerHelper.getPageHelper();
            await pageHelper.navigateToUrlAndGetHtml(input.url);
            const [desktopShot, mobileShot] = await pageHelper.takeScreenshots([desktopResolution, mobileResolution]);

            if (!desktopShot || !mobileShot) {
                console.error("Failed to find one or more screenshots in the result set.");
                return c.text('Failed to generate one or more screenshots.', 500);
            }

            const htmlResponse = _generateHtmlResponse(input.url, desktopShot, mobileShot);
            return c.html(htmlResponse);

        } catch (error: any) {
            console.error(`Error during screenshot rendering for ${input.url}:`, error);
            return c.text(`Failed to render page. Error: ${error.message}`, 500);
        }
        // NOTE: We no longer call scraper.close() here. It's managed by the main application.
    });
}
*/
