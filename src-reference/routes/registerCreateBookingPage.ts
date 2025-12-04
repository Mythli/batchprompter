/*
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { WebsiteModifier, ModificationProcessResult } from '../lib/WebsiteModifier.js';
import { lowContentPageSchema, ParsedLowContentPageInfo } from '../schemas.js';
import { BuildScraperFunction, AiWebsiteInfoScraper } from "../lib/AiWebsiteInfoScraper.js";
import { EventTracker } from '../lib/EventTracker.js';
import { BuildSingleFilePageGenerator, TheConfig } from '../getConfig.js';
import * as fsp from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import * as cheerio from 'cheerio';

type BuildWebsiteModifier = (eventTracker: EventTracker) => WebsiteModifier;

export interface CreateBookingPageDependencies {
    app: Hono<any>;
    buildWebsiteModifier: BuildWebsiteModifier;
    buildLinkScraper: BuildScraperFunction;
    buildSingleFilePageGenerator: BuildSingleFilePageGenerator;
    config: TheConfig;
}

const inputSchema = z.object({
    url: z.string().url({ message: "Invalid URL format" }),
    maxIterations: z.number().min(0).max(5).optional().default(2),
    stream: z.coerce.boolean().optional().default(false),
    preview: z.coerce.boolean().optional().default(false),
});

/!**
 * Finds the most suitable URL to use for templating by scraping the initial URL
 * for links to pages like "Contact Us", "Imprint", or "Privacy Policy".
 * Falls back to the initial URL if no better option is found.
 *!/
async function findTargetUrl(linkScraper: AiWebsiteInfoScraper, initialUrl: string): Promise<string> {
    const scrapingInstruction = `Your goal is to find URLs for pages like "Contact Us", "Imprint", or "Privacy Policy".
- If a string attribute in the schema is optional do not put an empty string in if not found
- Always construct absolute urls`;

    const pageInfo: ParsedLowContentPageInfo = await linkScraper.scrapeInfo(initialUrl, lowContentPageSchema, scrapingInstruction);

    const targetUrl = pageInfo.websiteInfo?.imprintUrl || pageInfo.websiteInfo?.privacyUrl || pageInfo.websiteInfo?.contactUrl || initialUrl;

    return targetUrl;
}

/!**
 * Returns the detailed instruction prompt for the AI website modifier.
 *!/
function getModificationInstruction(targetPath: string): string {
    return `**Your Goal:**
Your primary task is to transform a given webpage into a clean, reusable HTML template. This involves isolating and replacing the page-specific content area with a placeholder, while meticulously preserving the site's overall header, footer, and layout structure.

**Key Placeholders:**
- \`{{content}}\`: Replaces the main content block (e.g., an article, contact form, privacy policy text).
- \`{pageTitle}\`: Used in the HTML \`<title>\` tag and any breadcrumbs.

**Styling and Layout:**
- Your primary goal is to preserve the original site's layout. The injected content should appear naturally within the page, with proper alignment and margins.
- **Your first preference should be to achieve this by selecting the correct content container.** This container should already have the necessary CSS for margins, padding, and width to correctly position the content.
- **As a fallback, if you cannot find a suitable container, you may inject custom CSS styles** (e.g., via \`<style>\` tags or inline \`style\` attributes) to fix layout issues like alignment, margins, and padding. Only use this if selecting a different container is not possible.

**Step-by-Step Instructions:**

1.  **Isolate the Main Content:**
    - **First, determine the page type:** Is it a standard page (like "Contact Us" or an article) or a "one-pager" (a single long page with multiple distinct sections)?
    - **For a standard page:** Identify the primary container element that wraps the page's unique content. **Crucially, do not select the \`<body>\` tag or any high-level wrappers that contain the site-wide header, navigation, or footer.**
    - **For a one-pager:** The \`<body>\` or \`<main>\` tag will contain multiple content sections (e.g., \`<section id="about">\`, \`<section id="services">\`). Your task is to **delete all of these sections except for one.** Choose a section with a simple, representative layout to serve as the template area. The container you will modify in the next step is this single remaining section.

2.  **Replace Content with Placeholder:**
    - Once you've identified the correct content container (either the main content block on a standard page, or the single remaining section on a one-pager), remove all of its inner HTML.
    - Place the \`{{content}}\` placeholder inside this now-empty container.

3.  **Remove Lingering Page-Specific Elements:**
    - After replacing the main content, scan for and remove any remaining page-specific elements that were outside the container you just modified.
    - This most commonly includes the page's main \`<h1>\` or \`<h2>\` title. These must be removed entirely, as the injected content will provide its own headings. Do not leave empty heading tags.

4.  **Update the HTML \`<title>\`:**
    - In the document's \`<head>\`, find the \`<title>\` tag.
    - Modify its content to use the \`{pageTitle}\` placeholder. Retain any existing site branding. For example, "Contact Us | My Awesome Site" should become "{pageTitle} | My Awesome Site".

5.  **Update Breadcrumbs (if present):**
    - If the page uses breadcrumb navigation, replace the text for the current page with the \`{pageTitle}\` placeholder.

6.  **Deactivate Current Navigation Link:**
    - Find any navigation links (in the header, sidebar, or footer) that point to the current page's path ("${targetPath}").
    - These links often have an "active" or "current" CSS class. Remove this class to ensure the link appears as a standard, non-active link in the template.`;
}

/!**
 * Generates the static site files, applies the modification, and optionally creates a gzipped archive.
 *!/
async function generateAndPackageSite(
    result: ModificationProcessResult,
    targetUrl: string,
    buildSingleFilePageGenerator: BuildSingleFilePageGenerator,
    config: TheConfig,
    isPreview: boolean
): Promise<{ previewUrl: string; archiveUrl: string | null }> {
    const { generator, outputDir } = buildSingleFilePageGenerator();
    const pageHelper = await generator.generate({ type: 'url', value: targetUrl });

    try {
        const modificationCode = result.bestIteration!.generatedCode;
        if (modificationCode) {
            await pageHelper.getPage().setJavaScriptEnabled(true);
            await pageHelper.getPage().evaluate(modificationCode);
        }
        let finalModifiedHtml = await pageHelper.getFinalHtml();

        // Add placeholder at the end of the body
        const $ = cheerio.load(finalModifiedHtml);
        $('body').append('{{endOfBody}}');
        finalModifiedHtml = $.html();

        await fsp.writeFile(path.join(outputDir, 'index.html'), finalModifiedHtml);
    } finally {
        await pageHelper.close();
    }

    const id = path.basename(outputDir);

    // Ensure the base URL has a trailing slash for correct relative path resolution.
    const appUrlBase = config.APP_URL.endsWith('/') ? config.APP_URL : `${config.APP_URL}/`;

    const servePath = `public/${id}/index.html`;
    const previewUrl = new URL(servePath, appUrlBase).href;
    let archiveUrl: string | null = null;

    if (!isPreview) {
        const archivePath = path.join(path.dirname(outputDir), `${id}.tar.gz`);
        await new Promise<void>((resolve, reject) => {
            const outputStream = fs.createWriteStream(archivePath);
            const archive = archiver('tar', { gzip: true });
            outputStream.on('close', () => {
                console.log(`[Create Booking Page] Created archive: ${archivePath} (${archive.pointer()} total bytes)`);
                resolve();
            });
            archive.on('error', (err) => reject(err));
            archive.pipe(outputStream);
            archive.directory(outputDir, false);
            archive.finalize();
        });
        const archiveRelativePath = `public/${id}.tar.gz`;
        archiveUrl = new URL(archiveRelativePath, appUrlBase).href;
    }

    return { previewUrl, archiveUrl };
}

/!**
 * Builds the HTML response containing an iframe for previewing the generated site.
 *!/
function buildIframeResponse(targetUrl: string, previewUrl: string, archiveUrl: string | null): string {
    const downloadLinkHtml = archiveUrl
        ? `<a href="${archiveUrl}" download style="position: fixed; top: 10px; right: 10px; z-index: 1000; background: #007bff; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; font-family: sans-serif; font-size: 14px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">Download Archive</a>`
        : '';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview: ${targetUrl}</title>
    <style>
        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; }
        iframe { border: none; width: 100%; height: 100%; }
    </style>
</head>
<body>
    ${downloadLinkHtml}
    <iframe src="${previewUrl}"></iframe>
</body>
</html>`;
}

export function registerCreateBookingPage(deps: CreateBookingPageDependencies): void {
    const { app, buildWebsiteModifier, buildLinkScraper, buildSingleFilePageGenerator, config } = deps;

    app.get('/create-booking-page', zValidator('query', inputSchema), async (c) => {
        const input = c.req.valid('query');
        const eventTracker = new EventTracker();
        eventTracker.startPerformanceLogging(input.url);

        const createBookingPageAction = async () => {
            const linkScraper = buildLinkScraper(eventTracker);
            const modifier = buildWebsiteModifier(eventTracker);

            const targetUrl = await findTargetUrl(linkScraper, input.url);
            const instruction = getModificationInstruction(new URL(targetUrl).pathname);

            const result = await modifier.modify({
                url: targetUrl,
                instruction,
                maxIterations: input.maxIterations
            });

            if (result.isSuccess && result.bestIteration) {
                const { previewUrl, archiveUrl } = await generateAndPackageSite(
                    result,
                    targetUrl,
                    buildSingleFilePageGenerator,
                    config,
                    input.preview
                );
                return { success: true, previewUrl, archiveUrl, targetUrl };
            } else {
                const bestScore = result.bestIteration?.verification.score ?? 'N/A';
                const failureMessage = `Modification failed for ${targetUrl}. Best score was ${bestScore}.`;
                console.error(`[Booking Page] ${failureMessage}`);
                return { success: false, targetUrl, message: failureMessage };
            }
        };

        if (input.stream) {
            return eventTracker.streamSse(c, async () => {
                const result = await createBookingPageAction();
                if (result.success) {
                    return result;
                }
                throw new Error(result.message || `The requested modification for URL ${result.targetUrl} was not completed successfully.`);
            });
        }

        try {
            const result = await createBookingPageAction();
            if (result.success) {
                if (input.preview) {
                    const iframeHtml = buildIframeResponse(result.targetUrl, result.previewUrl, result.archiveUrl);
                    return c.html(iframeHtml);
                } else {
                    return c.json({
                        message: "Booking page template created successfully.",
                        archiveUrl: result.archiveUrl,
                        previewUrl: result.previewUrl,
                        sourceUrl: result.targetUrl
                    });
                }
            } else {
                return c.json({
                    error: "Booking Page Creation Failed",
                    message: result.message
                }, 500);
            }
        } catch (error: any) {
            console.error(`[API GET] Error during booking page creation for ${input.url}:`, error);
            return c.json({
                error: "An Error Occurred",
                message: `An unexpected error occurred while trying to generate the booking page for ${input.url}. Error: ${error.message || 'Unknown error'}`
            }, 500);
        }
    });
}
*/
