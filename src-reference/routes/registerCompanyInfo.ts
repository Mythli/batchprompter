import { Hono, Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type PQueue from 'p-queue';
import { merge } from 'lodash-es';
import { companyParsingSchema } from "../schemas.js";
import { BuildScraperFunction, AiWebsiteInfoScraper } from "../lib/AiWebsiteInfoScraper.js";
import { BuildLogoScraperFunction, AiLogoScraper } from '../lib/AiLogoScraper.js';
import { EventTracker } from '../lib/EventTracker.js';

export interface RegisterCompanyInfoDependencies {
    app: Hono<any>;
    buildInfoScraper: BuildScraperFunction;
    buildLogoScraper: BuildLogoScraperFunction;
    companyInfoQueue: PQueue;
}

// Define Zod schemas for input validation.

// Schema for GET requests, where all parameters are in the query string.
const companyInfoGetSchema = z.object({
    url: z.string().url({ message: "Invalid URL format" }).optional(),
    urls: z.preprocess(
        // Allow comma-separated URLs in query params for `urls`
        (val) => (Array.isArray(val) ? val : typeof val === 'string' && val.length > 0 ? val.split(',') : undefined),
        z.array(z.string().url({ message: "Invalid URL format" })).optional()
    ),
    stream: z.coerce.boolean().optional(),
    preview: z.coerce.boolean().optional(),
}).refine(data => data.url || (data.urls && data.urls.length > 0), {
    message: "Either 'url' or 'urls' must be provided.",
});


type CompanyInfoInput = {
    url?: string;
    urls?: string[];
    stream?: boolean;
    preview?: boolean;
};

/**
 * Renders a JavaScript object into a structured HTML format using definition lists.
 * This function recursively traverses the object and its nested properties.
 * @param data The object to render.
 * @returns An HTML string representing the object.
 */
function renderDataAsHtml(data: any): string {
    if (data === null || typeof data !== 'object') {
        return '';
    }

    const renderValue = (value: any): string => {
        if (value === null || value === undefined) {
            return '<em>N/A</em>';
        }

        // Check for hex color codes (e.g., #FFF, #FF00AA, #FF00AA00)
        if (typeof value === 'string' && /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/i.test(value)) {
            return `
                <span class="color-swatch-container">
                    <span class="color-swatch" style="background-color: ${value};"></span>
                    <code>${value}</code>
                </span>
            `;
        }

        if (typeof value === 'string' && (value.startsWith('http:') || value.startsWith('https:'))) {
            try {
                new URL(value); // Validate if it's a real URL
                return `<a href="${value}" target="_blank" rel="noopener noreferrer">${value}</a>`;
            } catch (_) {
                return value; // It's not a valid URL, so just display as text
            }
        }
        if (Array.isArray(value)) {
            if (value.length === 0) return '<em>(empty list)</em>';
            return `<ul>${value.map(item => `<li>${renderValue(item)}</li>`).join('')}</ul>`;
        }
        if (typeof value === 'object') {
            return renderObject(value);
        }
        return String(value);
    };

    const renderObject = (obj: object): string => {
        const entries = Object.entries(obj);
        if (entries.length === 0) return '<em>(empty object)</em>';

        let html = '<dl>';
        for (const [key, value] of entries) {
            // Format keys like 'camelCase' to 'Camel Case' for readability
            const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            html += `<dt>${formattedKey}</dt>`;
            html += `<dd>${renderValue(value)}</dd>`;
        }
        html += '</dl>';
        return html;
    };

    return renderObject(data);
}

function generatePreviewHtml(results: any[]): string {
    const styles = `
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; background-color: #f0f2f5; color: #333; }
        header { background-color: #fff; padding: 1rem 2rem; border-bottom: 1px solid #ddd; }
        main { padding: 2rem; }
        .company { background-color: #fff; border: 1px solid #ccc; border-radius: 8px; margin-bottom: 2rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden; }
        .company-header { background-color: #f7f7f7; padding: 1rem 1.5rem; border-bottom: 1px solid #ccc; }
        .company-header h2 { margin: 0; color: #333; font-size: 1.25rem; }
        .company-header a { text-decoration: none; color: #007bff; }
        .company-header a:hover { text-decoration: underline; }
        .company-content { padding: 1.5rem; }
        .company-content h3 { margin-top: 0; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
        .error { color: #d9534f; font-weight: bold; }
        .logos { display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-start; padding: 1rem 0; }
        .logo-container { border: 1px solid #eee; padding: 1rem; text-align: center; border-radius: 4px; background-color: #fcfcfc; }
        .logo-container img { max-width: 200px; max-height: 100px; object-fit: contain; background-image: repeating-conic-gradient(#e0e0e0 0% 25%, #ffffff 0% 50%); background-size: 20px 20px; }
        .logo-container p { margin: 0.5rem 0 0; font-size: 0.875rem; color: #555; }
        pre { background-color: #282c34; color: #abb2bf; padding: 1rem; border-radius: 4px; white-space: pre-wrap; word-wrap: break-word; font-family: "Fira Code", "Courier New", monospace; font-size: 0.9rem; }
        /* Styles for rendered data */
        dl { margin-left: 0; padding-left: 1rem; }
        dt { font-weight: bold; color: #333; margin-top: 0.8rem; }
        dd { margin-left: 1rem; padding-bottom: 0.5rem; border-left: 2px solid #eee; padding-left: 1rem; word-wrap: break-word; }
        dd ul { list-style-type: disc; padding-left: 1.5rem; margin-top: 0.5rem; }
        dd li { margin-bottom: 0.25rem; }
        dd a { color: #007bff; }
        dd code { background-color: #eee; padding: 2px 4px; border-radius: 3px; font-family: "Fira Code", "Courier New", monospace; }
        /* Styles for color swatches */
        .color-swatch-container { display: inline-flex; align-items: center; gap: 0.5rem; vertical-align: middle; }
        .color-swatch { width: 1.2rem; height: 1.2rem; border: 1px solid #ccc; border-radius: 4px; }
    `;

    const body = results.map(data => {
        if (data.status === 'error') {
            return `
                <div class="company">
                    <div class="company-header">
                        <h2><a href="${data.requestUrl}" target="_blank" rel="noopener noreferrer">${data.requestUrl}</a></h2>
                    </div>
                    <div class="company-content">
                        <p class="error">Failed to scrape: ${data.error}</p>
                    </div>
                </div>
            `;
        }

        const logosHtml = data.logos?.map((logo: any) => `
            <div class="logo-container">
                <img src="${logo.base64PngData}" alt="Logo">
                <p>Light bg: ${logo.lightBackgroundPerformance}/10</p>
                <p>Dark bg: ${logo.darkBackgroundPerformance}/10</p>
            </div>
        `).join('') || '<p>No valid brand logos found.</p>';

        const dataForRendering = { ...data };
        delete dataForRendering.logos;
        delete dataForRendering.requestUrl;
        delete dataForRendering.status;

        const scrapedDataHtml = renderDataAsHtml(dataForRendering);

        return `
            <div class="company">
                <div class="company-header">
                    <h2><a href="${data.requestUrl}" target="_blank" rel="noopener noreferrer">${data.company?.legalName || data.requestUrl}</a></h2>
                </div>
                <div class="company-content">
                    <h3>Logos</h3>
                    <div class="logos">${logosHtml}</div>
                    <h3>Scraped Data</h3>
                    ${scrapedDataHtml}
                </div>
            </div>
        `;
    }).join('');

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Scrape Preview</title>
            <style>${styles}</style>
        </head>
        <body>
            <header><h1>Scrape Results Preview</h1></header>
            <main>${body}</main>
        </body>
        </html>
    `;
}

/**
 * The core scraping logic for a set of URLs. It uses a queue to process URLs
 * and a result processor to format the output for different use cases (e.g., preview vs. JSON).
 */
async function scrapeAndProcessUrls(
    urls: string[],
    infoScraper: AiWebsiteInfoScraper,
    logoScraper: AiLogoScraper,
    companyInfoQueue: PQueue,
    processResult: (url: string, result: { status: 'success', data: any } | { status: 'error', error: any }) => any,
    mergeInstruction?: string,
) {
    const infoInstruction = `Focus on detail and completeness.
- If a string attribute in the schema is optional do not put an empty string or N/A or null in it omit it from the object
- Never create null properties in objects rather omit them as per the schema
- Always construct absolute urls`;

    return companyInfoQueue.addAll(
        urls.map((url) => async () => {
            try {
                const [infoResult, logoResult] = await Promise.allSettled([
                    infoScraper.scrape(url, companyParsingSchema, infoInstruction, mergeInstruction),
                    logoScraper.scrape(url),
                ]);

                if (infoResult.status === 'rejected') {
                    throw infoResult.reason;
                }

                const infoData = infoResult.value;
                const logoData = logoResult.status === 'fulfilled' ? logoResult.value : {};
                if (logoResult.status === 'rejected') {
                    console.warn(`[${url}] Non-critical failure during logo processing, continuing without logos:`, logoResult.reason);
                }

                const mergedData = merge({}, infoData, logoData);
                return processResult(url, { status: 'success', data: mergedData });

            } catch (error: any) {
                console.error(`[${url}] Failed to scrape:`, error);
                return processResult(url, { status: 'error', error });
            }
        })
    );
}

/**
 * Handles a request for an HTML preview of the scrape results.
 */
async function handlePreviewRequest(
    c: Context,
    urls: string[],
    infoScraper: AiWebsiteInfoScraper,
    logoScraper: AiLogoScraper,
    companyInfoQueue: PQueue,
    mergeInstruction?: string,
) {
    const previewResultProcessor = (url: string, result: { status: 'success', data: any } | { status: 'error', error: any }) => {
        if (result.status === 'success') {
            return { ...result.data, requestUrl: url, status: 'success' };
        }
        return { requestUrl: url, status: 'error', error: result.error.message };
    };

    try {
        const results = await scrapeAndProcessUrls(urls, infoScraper, logoScraper, companyInfoQueue, previewResultProcessor, mergeInstruction);
        const html = generatePreviewHtml(results as any[]);
        c.header('Content-Type', 'text/html; charset=utf-8');
        return c.body(html);
    } catch (error: any) {
        console.error(`[${urls.join(', ')}] Final error in preview request:`, error);
        c.status(500);
        c.header('Content-Type', 'text/html; charset=utf-8');
        return c.body(`<h1>Error</h1><p>Failed to generate preview.</p><pre>${error.message}</pre>`);
    }
}

/**
 * The main handler for all company info requests. It validates input, creates scrapers,
 * and delegates to the appropriate handler for preview, streaming, or standard JSON responses.
 */
async function handleCompanyInfoRequest(
    c: Context,
    buildInfoScraper: BuildScraperFunction,
    buildLogoScraper: BuildLogoScraperFunction,
    input: CompanyInfoInput,
    companyInfoQueue: PQueue
) {
    // 1. Normalize URLs and check for single URL for backward compatibility
    const wasSingleUrlRequest = !!input.url && !input.urls;
    const urls = [...new Set([...(input.urls || []), ...(input.url ? [input.url] : [])])];

    if (urls.length === 0) {
        c.status(400);
        return c.json({ error: "A URL must be provided." });
    }

    // 2. Create event tracker and scrapers once for this request
    const eventTracker = new EventTracker();
    eventTracker.startPerformanceLogging();

    const mergeInstruction = `Your primary goal is to ensure the final JSON object has a single, complete 'sampleOffer'.

Follow these steps:
1.  **Review Existing Offers:** Look at all the 'sampleOffer' objects from the provided JSON data. Select the most complete and representative one as your base.
2.  **Create if Missing:** If NO 'sampleOffer' exists in any of the JSON objects, you MUST create a new one from scratch. Use the provided HTML context of the main page to invent a plausible core offering for the company.
3.  **Complete the Offer:** Whether you selected an existing offer or created a new one, ensure it is complete. If it's missing a 'description' or 'price', use the HTML context to add the missing information about the offer.
4.  **Invent a Price if Necessary:** If no price can be found in any source, you MUST invent a realistic price for the offer based on its description and the company's business.

The final 'sampleOffer' must be complete with a title, description, and a price.`;

    const infoScraper = buildInfoScraper(eventTracker, {
        useAiMerge: true,
        mergeInstruction: mergeInstruction,
    });
    const logoScraper = buildLogoScraper(eventTracker);

    // 3. Handle preview mode
    if (input.preview) {
        if (input.stream) {
            c.status(400);
            return c.json({ error: "The 'preview' and 'stream' options cannot be used together." });
        }
        return handlePreviewRequest(c, urls, infoScraper, logoScraper, companyInfoQueue, mergeInstruction);
    }

    // 4. Handle streaming or regular JSON response
    const scrapeAction = async () => {
        const jsonResultProcessor = (_url: string, result: { status: 'success', data: any } | { status: 'error', error: any }) => {
            if (result.status === 'success') {
                return result.data;
            }
            // Propagate the error to fail the task in the queue
            throw result.error;
        };

        const results = await scrapeAndProcessUrls(urls, infoScraper, logoScraper, companyInfoQueue, jsonResultProcessor, mergeInstruction);

        // For backward compatibility, return a single object if a single URL was requested.
        if (wasSingleUrlRequest && results.length === 1) {
            return results[0];
        }
        return results;
    };

    const mainAction = () => eventTracker.trackOperation(
        'totalCompanyInfoScrape',
        { urls },
        scrapeAction
    );

    if (input.stream) {
        return eventTracker.streamSse(c, mainAction);
    }

    try {
        const companyInfo = await mainAction();
        return c.json(companyInfo);
    } catch (error: any) {
        console.error(`[${urls.join(', ')}] Final error in non-streamed request:`, error);
        c.status(500);
        return c.json({ error: 'Failed to scrape company info', details: error.message });
    }
}

export function registerCompanyInfoRoute(deps: RegisterCompanyInfoDependencies) {
    const { app, buildInfoScraper, buildLogoScraper, companyInfoQueue } = deps;

    app.get(
        '/companyInfo',
        zValidator('query', companyInfoGetSchema),
        async (c) => {
            const input = c.req.valid('query');
            return handleCompanyInfoRequest(c, buildInfoScraper, buildLogoScraper, input, companyInfoQueue);
        }
    );
}
