import OpenAI from 'openai';
import { z } from 'zod';
import { EventEmitter } from 'eventemitter3';
import { BoundLlmClient } from '../../../core/BoundLlmClient.js';
import { PuppeteerHelper } from '../../../utils/puppeteer/PuppeteerHelper.js';
import { PuppeteerPageHelper, Resolution } from '../../../utils/puppeteer/PuppeteerPageHelper.js';
import { compressHtml } from '../../../utils/compressHtml.js';
import { CssParser } from './CssParser.js';
import { ImageDownloader, ImageConversionResult } from './ImageDownloader.js';

export interface LogoScraperOptions {
    maxLogosToAnalyze?: number;
    brandLogoScoreThreshold?: number;
}

const hexColorRegex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{8})$/;

const backgroundPerformanceScale = z.number().min(0).max(10)
    .describe("A qualitative rating of the logo's performance on a given background type (0 = terrible, 10 = great).");

const analysedLogoSchema = z.object({
    brandLogoScore: z.number().min(1).max(10)
        .describe("A score from 1 to 10 indicating how likely the image is the main brand logo for the website. 1 means it's definitely not the logo, 10 means it is definitely the main logo."),
    duplicateOfIndex: z.number().int().min(0).nullable()
        .describe("If this image is visually identical to a PREVIOUS image in the list (ignoring resolution), provide the 0-based index of the first instance of that image. Otherwise, this should be null."),
    darkBackgroundPerformance: backgroundPerformanceScale.optional()
        .describe("Rates the logo's visual clarity, readability, and overall appeal when placed on a dark-colored background. Only provide this if brandLogoScore is high (e.g., > 6)."),
    lightBackgroundPerformance: backgroundPerformanceScale.optional()
        .describe("Evaluates how well the logo stands out and remains legible when used on a light or white background. Only provide this if brandLogoScore is high (e.g., > 6)."),
});

const brandColorSchema = z.object({
    hex: z.string()
        .regex(hexColorRegex, "Invalid hex color format. Must be #RGB, #RRGGBB, #RGBA, or #RRGGBBAA.")
        .describe("The hex code of the brand color. Avoid extremely light colors like pure white (#FFFFFF)."),
    isDark: z.boolean().describe("Whether this brand color is dark (e.g., requires light text on top for good contrast)."),
    contrastColor: z.string()
        .regex(hexColorRegex, "Invalid hex color format. Must be #RGB, #RRGGBB, #RGBA, or #RRGGBBAA.")
        .describe("A color that has good text contrast with the brand color.")
});

const LOGO_FINDER_PROMPT_BASE = (url: string, siteTitle: string, maxLogos: number) => `You are an expert web asset analyst. Your task is to identify sources for the main brand logo from the provided HTML, CSS, and a screenshot of the website.

Website URL: ${url}
Website Title: "${siteTitle}"

Your goal is to find up to ${maxLogos} sources for images that are the primary logo for the brand "${siteTitle}".

**CRITICAL INSTRUCTIONS:**
- Use the HTML, CSS, and the screenshot to find logos. The screenshot helps you visually identify the main logo and its location.
- Focus on the BRAND's logo only. The logo must represent "${siteTitle}".
- DO NOT extract logos for other companies (e.g., social media, payment providers).
- Analyze the HTML carefully. Look for clues like 'logo' in filenames, alt text, or CSS classes.
- Analyze the provided CSS snippets. They contain \`background-image\` properties that may point to a logo.`;

export class AiLogoScraper {
    public readonly events = new EventEmitter();

    constructor(
        private puppeteerHelper: PuppeteerHelper,
        private analyzeLlm: BoundLlmClient,
        private extractLlm: BoundLlmClient,
        private imageDownloader: ImageDownloader,
        private options: LogoScraperOptions = {}
    ) {
        this.options.maxLogosToAnalyze = options.maxLogosToAnalyze ?? 10;
        this.options.brandLogoScoreThreshold = options.brandLogoScoreThreshold ?? 5;
    }

    public async scrape(url: string) {
        const pageHelper = await this.puppeteerHelper.getPageHelper();
        try {
            const resolutions: Resolution[] = [{ width: 1280, height: 800 }];

            // Step 1: Navigate, dismiss cookies, and take a screenshot.
            const { pageHtml, pageCss, siteTitle, screenshotBase64, finalUrl } = await pageHelper.navigateAndCache(
                url,
                async (ph) => {
                    const pageHtml = await ph.getFinalHtml();
                    const pageCss = await ph.getCss();
                    const siteTitle = await ph.getPage().title();
                    const finalUrl = ph.getPage().url();
                    const screenshots = await ph.takeScreenshots(resolutions);

                    if (!screenshots?.[0]?.screenshotBase64) {
                        throw new Error(`Failed to take screenshot for ${url}`);
                    }
                    const screenshotBase64 = screenshots[0].screenshotBase64;
                    return { pageHtml, pageCss, siteTitle, screenshotBase64, finalUrl };
                },
                {
                    dismissCookies: true,
                    htmlOnly: false,
                    resolution: resolutions[0],
                    ttl: 3600 * 1000 // 1 hour cache
                }
            );

            url = finalUrl;

            // Step 2: Find and download assets using the same page context.
            const cssSnippets = CssParser.extractBlocksWithBackgroundImage(pageCss);

            // Run all logo finders in parallel.
            const faviconUrlsPromise = this.fetchFavicons(url, pageHelper);
            const logoUrlsPromise = this.findLogoUrlsByLlm(url, pageHtml, siteTitle, screenshotBase64, cssSnippets);
            const inlineLogosPromise = this.findInlineLogosByLlm(url, pageHtml, siteTitle, screenshotBase64, pageHelper);

            const results = await Promise.allSettled([
                faviconUrlsPromise,
                logoUrlsPromise,
                inlineLogosPromise,
            ]);

            const faviconUrls = results[0].status === 'fulfilled' ? (results[0].value as string[]) : [];
            const faviconUrlSet = new Set(faviconUrls);

            const logoUrls = results[1].status === 'fulfilled' ? (results[1].value as string[]) : [];
            const inlineLogoDataUris = results[2].status === 'fulfilled' ? (results[2].value as string[]) : [];

            const allLogoSources = [...new Set([...faviconUrls, ...logoUrls, ...inlineLogoDataUris])];
            const logosToDownload = allLogoSources.slice(0, this.options.maxLogosToAnalyze);
            
            console.log(`[AiLogoScraper] Found ${allLogoSources.length} potential logo URLs. Downloading ${logosToDownload.length}...`);

            const allBase64PngInfo = await Promise.all(logosToDownload.map(async (logoUrlOrDataUri) => {
                try {
                    const imageInfo = await this.imageDownloader.downloadAndProcess(logoUrlOrDataUri);
                    const isFavicon = faviconUrlSet.has(logoUrlOrDataUri);
                    return { ...imageInfo, isFavicon };
                } catch (err: any) {
                    // console.warn(`Failed to download logo: ${err.message}`);
                    return null;
                }
            }));

            const validLogos = allBase64PngInfo.filter(Boolean) as (ImageConversionResult & { isFavicon: boolean })[];

            // Sort logos by size (area) in descending order
            const sortedLogos = validLogos.sort((a, b) => {
                const areaA = (a.width || 0) * (a.height || 0);
                const areaB = (b.width || 0) * (b.height || 0);
                return areaB - areaA;
            });

            console.log(`[AiLogoScraper] Analyzing ${sortedLogos.length} downloaded logos...`);

            // Step 3: Normalize and analyze
            return this.normalizeLogos(url, sortedLogos, siteTitle, screenshotBase64);

        } catch (error) {
            console.error(`[AiLogoScraper] Error processing ${url}:`, error);
            return {};
        } finally {
            await pageHelper.close();
        }
    }

    private async fetchFavicons(url: string, pageHelper: PuppeteerPageHelper): Promise<string[]> {
        // Simple Puppeteer-based favicon extraction
        try {
            const favicons = await pageHelper.getPage().evaluate(() => {
                const links = Array.from(document.querySelectorAll('link[rel*="icon"]'));
                return links.map(link => (link as HTMLLinkElement).href).filter(href => href);
            });
            
            // Also try default /favicon.ico
            try {
                const urlObj = new URL(url);
                favicons.push(new URL('/favicon.ico', urlObj.origin).href);
            } catch (e) {}

            return [...new Set(favicons)];
        } catch (e) {
            return [];
        }
    }

    private async findLogoUrlsByLlm(url: string, html: string, siteTitle: string, screenshotBase64: string, cssSnippets: string): Promise<string[]> {
        try {
            const maxLogos = this.options.maxLogosToAnalyze ?? 5;
            const logoScrapingSchema = z.object({
                logoUrls: z.array(z.string())
                    .max(maxLogos)
                    .describe(`An array of up to ${maxLogos} absolute URLs or 'data:image/svg+xml' URIs pointing to potential logo images.`),
            });

            const mainInstruction = `${LOGO_FINDER_PROMPT_BASE(url, siteTitle, maxLogos)}

**Your specific task is to extract logo sources from the HTML and the provided CSS snippets.**
- From HTML: Look for \`<img>\` tags and extract the full value of the \`src\` attribute.
- From CSS: Look in the provided CSS snippets for \`background-image: url(...)\` or \`background: url(...)\` and extract the URL from within.

Return an array of these source URLs or data URIs.`;

            const compressedHtml = compressHtml(html);
            const userMessagePayload: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
                { type: "text", text: mainInstruction },
                { type: "text", text: `Website HTML:\n${compressedHtml}` },
                { type: "text", text: `\n\nPotentially relevant CSS:\n${cssSnippets}` },
                { type: "image_url", image_url: { url: screenshotBase64, detail: "low" } }
            ];

            const result = await this.extractLlm.promptZod({ suffix: userMessagePayload }, logoScrapingSchema);

            const foundUrls = result.logoUrls || [];

            // Resolve relative URLs
            const absoluteUrls = foundUrls.map(logoUrl => {
                if (logoUrl.startsWith('data:')) return logoUrl;
                try {
                    return new URL(logoUrl, url).href;
                } catch (e) {
                    return null;
                }
            }).filter((u): u is string => u !== null);

            return absoluteUrls;
        } catch (error) {
            console.warn(`[AiLogoScraper] LLM logo extraction failed:`, error);
            return [];
        }
    }

    private async findInlineLogosByLlm(url: string, html: string, siteTitle: string, screenshotBase64: string, pageHelper: PuppeteerPageHelper): Promise<string[]> {
        try {
            const maxLogos = this.options.maxLogosToAnalyze ?? 5;
            const mainInstruction = `${LOGO_FINDER_PROMPT_BASE(url, siteTitle, maxLogos)}

**Your specific task is to write a JavaScript function to extract INLINE logos (like <svg> elements) that do not have a direct \`src\` URL.**

You must provide a single **async JavaScript function** as a string, wrapped in a markdown code block. This function will be executed in the browser and must:
1.  Find all potential inline logo elements. Use specific query selectors to target logos, often found in headers or footers.
2.  For each element found, serialize it into a \`data:image/svg+xml\` data URI.
3.  Return a Promise that resolves to an array of all the data URI strings you've created.
4.  If no logos are found, the function should return an empty array.

**Example of the function you should generate:**
\`\`\`javascript
async () => {
    const dataUris = [];
    const elements = document.querySelectorAll('header .logo svg, [data-testid="logo"]');
    for (const el of elements) {
        if (el) {
            const s = new XMLSerializer().serializeToString(el);
            const dataUri = 'data:image/svg+xml;base64,' + window.btoa(unescape(encodeURIComponent(s)));
            dataUris.push(dataUri);
        }
    }
    return dataUris;
}
\`\`\`
`;
            const compressedHtml = compressHtml(html);
            const userMessagePayload: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
                { type: "text", text: mainInstruction },
                { type: "text", text: `Website HTML:\n${compressedHtml}` },
                { type: "image_url", image_url: { url: screenshotBase64, detail: "low" } }
            ];

            const response = await this.extractLlm.promptText({ suffix: userMessagePayload });

            const match = response.match(/```javascript\n([\s\S]*?)\n```/);
            const jsCode = match ? match[1] : null;

            if (!jsCode) return [];

            const dataUris = await pageHelper.getPage().evaluate(`(${jsCode})()`);

            if (Array.isArray(dataUris)) {
                return dataUris.filter((uri): uri is string => typeof uri === 'string' && uri.startsWith('data:'));
            }

            return [];
        } catch (error) {
            console.warn(`[AiLogoScraper] Inline logo extraction failed:`, error);
            return [];
        }
    }

    private async normalizeLogos(baseUrl: string, base64Logos: Array<ImageConversionResult & { isFavicon: boolean }>, siteTitle: string, screenshotBase64: string) {
        const analyseLogosSchema = z.object({
            brandColors: z.array(brandColorSchema)
                .min(1)
                .max(5)
                .describe("An array of up to 5 colors that represent the company's brand. The first color MUST be the primary brand color."),
            logos: z.array(analysedLogoSchema).length(base64Logos.length)
        });

        const mainInstruction = `You are an expert brand asset analyst. Your task is to analyze a screenshot of a website and a set of potential logo images to determine brand assets.

**Website Context:**
- Title: "${siteTitle}"
- URL: ${baseUrl}

**Task 1: Analyze Brand Colors from the Screenshot**
Identify up to 5 primary brand colors. The first color should be the main, most prominent one.

**Task 2: Analyze and Validate Each Potential Logo Image**
For each image provided, score how likely it is to be a genuine logo for the website (1-10).
- **Score 5-10:** High likelihood. Matches screenshot, favicon, or site context.
- **Score 1-4:** Unlikely. Partner logo, generic icon, etc.

Check for duplicates. If an image is a duplicate of a previous one, set 'duplicateOfIndex' to the index of the first instance.

Accurately populate the provided JSON schema.`;

        const userMessagePayload: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            { type: "text", text: mainInstruction },
            { type: "image_url", image_url: { url: screenshotBase64, detail: "low" } }
        ];

        if (base64Logos.length > 0) {
            userMessagePayload.push({ type: "text", text: "\n\nPotential logo images to analyze:" });
            base64Logos.forEach((logo, index) => {
                userMessagePayload.push({ type: "text", text: `Image ${index + 1} (${logo.width}x${logo.height}px)${logo.isFavicon ? ' (Favicon)' : ''}:` });
                userMessagePayload.push({ type: "image_url", image_url: { url: logo.base64PngData, detail: "low" } });
            });
        } else {
            userMessagePayload.push({ type: "text", text: "\n\nNo logo images were provided. Please determine brand colors from the screenshot." });
        }

        const logoMetaData = await this.analyzeLlm.promptZod({ suffix: userMessagePayload }, analyseLogosSchema);

        const brandColors = logoMetaData.brandColors || [];

        // Combine original logo info with LLM analysis
        const allLogoData = base64Logos.map((logo, i) => ({
            ...logo,
            ...logoMetaData.logos[i],
            originalIndex: i
        }));

        // Deduplicate
        const logoGroups: { [key: number]: typeof allLogoData } = {};
        allLogoData.forEach(logo => {
            const groupKey = logo.duplicateOfIndex ?? logo.originalIndex;
            if (!logoGroups[groupKey]) logoGroups[groupKey] = [];
            logoGroups[groupKey].push(logo);
        });

        const uniqueHighestResLogos = Object.values(logoGroups).map(group => {
            return group.reduce((best, current) => {
                const bestArea = (best.width || 0) * (best.height || 0);
                const currentArea = (current.width || 0) * (current.height || 0);
                return currentArea > bestArea ? current : best;
            });
        });

        // Filter by threshold
        const brandLogos = uniqueHighestResLogos.filter(logo => logo.brandLogoScore >= this.options.brandLogoScoreThreshold!);

        // Sort by score, then performance, then size
        const mergedAndSorted = brandLogos.sort((a, b) => {
            // 1. Brand Logo Score (Higher is better)
            if (b.brandLogoScore !== a.brandLogoScore) {
                return b.brandLogoScore - a.brandLogoScore;
            }

            // 2. Light Background Performance (Higher is better)
            // Treat missing as 0.
            const perfA = a.lightBackgroundPerformance ?? 0;
            const perfB = b.lightBackgroundPerformance ?? 0;
            if (perfB !== perfA) return perfB - perfA;

            // 3. Resolution (Higher is better)
            const areaA = (a.width || 0) * (a.height || 0);
            const areaB = (b.width || 0) * (b.height || 0);
            return areaB - areaA;
        });

        const primaryColor = brandColors.length > 0 ? brandColors[0] : undefined;

        return {
            primaryColor,
            brandColors,
            logos: mergedAndSorted
        };
    }
}
