import OpenAI from 'openai';
import {ZodObject, z} from 'zod';
import { createGetWebsiteIcon } from "./getWebsiteIcon.js";
import { Base64PngInfo, createImageUrlToBase64Png } from "./imageUrlToBase64Png.js";
import { ZodLlmQuerier, ZodLlmQuerierOptions } from "./zodLlmQuerier.js";
import {AskGptFunction} from "./createCachedGptAsk.js";
import { EventTracker } from './EventTracker.js';
import { PuppeteerPageHelper, Resolution } from './PupeteerPageHelper.js';
import { PuppeteerHelper } from './PuppeteerHelper.js';
import { compressHtml } from './compressHtml.js';
import { extractBlocksWithBackgroundImage } from './extractBlocksWithBackgroundImage.js';

export type LogoScraperOptions = {
    logoOptions: ZodLlmQuerierOptions,
    linkExtractOptions: ZodLlmQuerierOptions, // For finding logo URLs
    maxLogosToAnalyze?: number;
    brandLogoScoreThreshold?: number;
}

export type AiLogoScraperDependencies = {
    ask: AskGptFunction;
    askWeak: AskGptFunction;
    eventTracker: EventTracker;
    puppeteerHelper: PuppeteerHelper;
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
        .describe("A color that has good text contrast with the brand color. For example, if the brand color is dark, the contrast color should be light (e.g., #FFFFFF). If the brand color is light, the contrast color should be dark (e.g., #000000).")
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
    protected zodLlmQuerier: ZodLlmQuerier;
    protected zodLlmLinkQuerier: ZodLlmQuerier;
    protected eventTracker: EventTracker;
    protected puppeteerHelper: PuppeteerHelper;
    protected options: LogoScraperOptions;
    private askWeak: AskGptFunction;

    constructor(dependencies: AiLogoScraperDependencies, options: LogoScraperOptions) {
        this.zodLlmQuerier = new ZodLlmQuerier(dependencies.ask);
        this.zodLlmLinkQuerier = new ZodLlmQuerier(dependencies.askWeak);
        this.askWeak = dependencies.askWeak;
        this.eventTracker = dependencies.eventTracker;
        this.puppeteerHelper = dependencies.puppeteerHelper;
        this.options = {
            ...options,
            maxLogosToAnalyze: options.maxLogosToAnalyze ?? 10,
            brandLogoScoreThreshold: options.brandLogoScoreThreshold ?? 5,
        };
    }

    private async analyseLogos(baseUrl: string, siteTitle: string, logos: Array<Base64PngInfo & { isFavicon: boolean }>, schema: ZodObject<any, any, any>, screenshotBase64: string) {
        const threshold = this.options.brandLogoScoreThreshold!;
        const mainInstruction = `You are an expert brand asset analyst. Your task is to analyze a screenshot of a website and a set of potential logo images to determine brand assets.

**Website Context:**
- Title: "${siteTitle}"
- URL: ${baseUrl}

You are provided with a full-page screenshot of the website and a list of potential logo images.

**Task 1: Analyze Brand Colors from the Screenshot**
1.  Use the screenshot to identify up to 5 primary brand colors. The first color should be the main, most prominent one.
2.  Avoid pure white or very light off-white colors.
3.  For each color, you must provide:
    - \`hex\`: The hex code for the color.
    - \`isDark\`: A boolean indicating if it's a dark color.
    - \`contrastColor\`: A hex code for a color that provides excellent text contrast against the brand color. For a dark brand color, this should be light (e.g., #FFFFFF). For a light brand color, it should be dark (e.g., #000000). Observe the website for common text colors used on colored backgrounds.

**Task 2: Analyze and Validate Each Potential Logo Image**
For each image provided, you must perform the following analysis:

**A. Logo Identification (Crucial)**
Your goal is to score how likely each image is to be a genuine logo for the website. Use all the following clues to assign a score from 1 to 10 for \`brandLogoScore\`. A score of ${threshold} or higher is considered a valid brand logo.

**Scoring Guidelines:**
- **Score ${threshold}-10 (High Likelihood - A Brand Logo):** Assign this score if the image is a strong match for **at least ONE** of the clues below. This means the image is very likely a primary or secondary brand logo.
- **Score 1-${threshold - 1} (Unlikely to be a logo):** The image is a partner's logo, a generic icon, a payment provider logo, or a random picture from the site.

**Clues to Evaluate:**
1.  **Screenshot Match:** Does the image appear on the screenshot as a primary branding element (e.g., in the header or footer)? A strong match here is a very clear indicator.
2.  **Favicon Status:** Is the image labeled as a "(Favicon)"? Favicons are very often the brand's logo. However, sometimes a website might have a generic default favicon (like a WordPress or hosting provider logo). If the favicon appears generic and not specific to "${siteTitle}", you should give it a low score. If it is specific to the brand, it's a very strong indicator.
3.  **Site Context:** Does the content of the image (text, symbols) unambiguously represent the brand "${siteTitle}"? For example, a logo containing the exact brand name or an abbreviation of it.

The logo must represent "${siteTitle}", not a partner's logo, a payment icon, or a generic graphic.

**B. Duplicate Detection**
Check if the image is an exact visual duplicate of a *previous* image in the list (ignoring resolution).
- An image is a duplicate ONLY if it has the exact same design, colors, and composition.
- Different color variations, different designs (e.g., full logo vs. icon-only), or monochrome vs. color versions are NOT duplicates.
- If it is a duplicate, set 'duplicateOfIndex' to the 0-based index of the *first* instance of that logo. Otherwise, set it to null.
- This check applies to ALL images, regardless of whether they are brand logos.

**C. Performance Evaluation**
If you assign a \`brandLogoScore\` of ${threshold} or higher, you MUST also rate its performance on light and dark backgrounds. If the score is lower, you should omit these fields.

Accurately populate the provided JSON schema with your findings. The brand colors should be derived primarily from the screenshot.`;

        const userMessagePayload: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

        if (screenshotBase64) {
            userMessagePayload.push({
                type: "text",
                text: "Full page screenshot of the website for brand color analysis:"
            }, {
                type: "image_url",
                image_url: { url: screenshotBase64, detail: "low" }
            });
        }

        if (logos.length > 0) {
            userMessagePayload.push({
                type: "text",
                text: "\n\nPotential logo images to analyze:"
            });
            logos.forEach((logo, index) => {
                userMessagePayload.push({
                    type: "text",
                    text: `Image ${index + 1} (${logo.width}x${logo.height}px)${logo.isFavicon ? ' (Favicon)' : ''}:`
                });
               userMessagePayload.push({
                    type: "image_url",
                    image_url: {
                        url: logo.base64PngData,
                        detail: "low" // Consider making this configurable or using "high" for better detail
                    }
                });
            });
        } else {
            userMessagePayload.push({
                type: "text",
                text: "\n\nNo logo images were provided. Please determine brand colors from the screenshot."
            });
        }

        const logoOptions = this.options.logoOptions;

        const extractedData = await this.eventTracker.trackOperation(
            'analyse_assets',
            { baseUrl, logoCount: logos.length },
            () => this.zodLlmQuerier.query(
                mainInstruction,
                userMessagePayload,
                schema as any,
                logoOptions
            )
        );

        return extractedData;
    }

    private deduplicateAndSelectBestLogos(
        allLogoData: (Base64PngInfo & z.infer<typeof analysedLogoSchema> & { originalIndex: number; isFavicon: boolean })[]
    ) {
        const logoGroups: { [key: number]: typeof allLogoData } = {};
        allLogoData.forEach(logo => {
            // A logo is part of a group identified by the index of the first logo in that group.
            // If `duplicateOfIndex` is null, it's the first one, so it defines a new group with its own index.
            const groupKey = logo.duplicateOfIndex ?? logo.originalIndex;
            if (!logoGroups[groupKey]) {
                logoGroups[groupKey] = [];
            }
            logoGroups[groupKey].push(logo);
        });

        // From each group, select the one with the highest resolution (area)
        const uniqueHighestResLogos = Object.values(logoGroups).map(group => {
            return group.reduce((best, current) => {
                const bestArea = (best.width || 0) * (best.height || 0);
                const currentArea = (current.width || 0) * (current.height || 0);
                return currentArea > bestArea ? current : best;
            });
        });

        return uniqueHighestResLogos;
    }

    protected async normalizeLogos(baseUrl: string, base64Logos: Array<Base64PngInfo & { isFavicon: boolean }>, siteTitle: string, screenshotBase64: string) {
        const analyseLogosSchema = z.object({
            brandColors: z.array(brandColorSchema)
                .min(1)
                .max(5)
                .describe("An array of up to 5 colors that represent the company's brand. These should be the most prominent colors from the provided images. The first color in this array MUST be the primary, most prominent brand color."),
            logos: z.array(analysedLogoSchema).length(base64Logos.length)
        });


        const logoMetaData = await this.analyseLogos(baseUrl, siteTitle, base64Logos, analyseLogosSchema, screenshotBase64);

        const brandColors = logoMetaData.brandColors || [];

        // Combine original logo info with LLM analysis
        const allLogoData = base64Logos.map((logo, i) => ({
            ...logo,
            ...logoMetaData.logos[i],
            originalIndex: i // Keep track of original index
        }));

        // Deduplicate ALL logos first by grouping them and picking the highest resolution from each group.
        const uniqueHighestResLogos = this.deduplicateAndSelectBestLogos(allLogoData);

        // NOW, filter for valid brand logos from the unique, high-res list.
        // A logo is considered a brand logo if its score is above the threshold.
        const brandLogos = uniqueHighestResLogos.filter(logo => logo.brandLogoScore >= this.options.brandLogoScoreThreshold!);

        // Sort the unique logos based on the specified criteria
        const mergedAndSorted = brandLogos.sort((a, b) => {
            // 1. Primary sort: lightBackgroundPerformance descending (higher is better)
            // Handle cases where performance metrics might be missing.
            const perfA = a.lightBackgroundPerformance ?? -1;
            const perfB = b.lightBackgroundPerformance ?? -1;
            const perfDifference = perfB - perfA;
            if (perfDifference !== 0) {
                return perfDifference;
            }

            // 2. Secondary sort: area (width * height) descending (larger is better)
            const areaA = (a.width || 0) * (a.height || 0);
            const areaB = (b.width || 0) * (b.height || 0);
            return areaB - areaA;
        });

        const primaryColor = brandColors.length > 0 ? brandColors[0] : undefined;

        return {
            primaryColor,
            brandColors: brandColors,
            logos: mergedAndSorted // Return the sorted and de-duplicated array
        };
    }

    private async fetchFavicons(url: string, html: string, pageHelper: PuppeteerPageHelper): Promise<string[]> {
        const fetchBuffer = (bufferUrl: string): Promise<ArrayBuffer> => {
            return pageHelper.fetchResourceAsDataWithCache(bufferUrl).then(res => res.arrayBuffer());
        };

        const fetchText = async (theFetchedUrl: string) => {
            if(url === theFetchedUrl) {
                return html;
            }


            return (await pageHelper.fetchResourceAsDataWithCache(theFetchedUrl)).text();
        };

        const getWebsiteIcon = createGetWebsiteIcon({ fetchText, fetchBuffer });

        return getWebsiteIcon(url);
    }

    private createLogoFinderUserMessage(
        html: string,
        screenshotBase64: string,
        instructionText?: string,
        cssSnippets?: string
    ): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
        const compressedHtml = compressHtml(html);
        const textParts = [];
        if (instructionText) {
            textParts.push(instructionText);
        }
        textParts.push(`Website HTML:\n${compressedHtml}`);

        if (cssSnippets) {
            textParts.push(`\n\nPotentially relevant CSS:\n${cssSnippets}`);
        }

        const userMessagePayload: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            {
                type: "text",
                text: textParts.join('\n\n')
            },
        ];

        if (screenshotBase64) {
            userMessagePayload.push({
                type: "image_url",
                image_url: {
                    url: screenshotBase64,
                    detail: "low"
                }
            });
        }
        return userMessagePayload;
    }

    private async findLogoUrlsByLlm(url: string, html: string, siteTitle: string, screenshotBase64: string, cssSnippets: string): Promise<string[]> {
        try {
            const maxLogos = this.options.maxLogosToAnalyze ?? 5;
            const logoScrapingSchema = z.object({
                logoUrls: z.array(z.string())
                    .max(maxLogos)
                    .describe(`An array of up to ${maxLogos} absolute URLs or 'data:image/svg+xml' URIs pointing to potential logo images for the brand "${siteTitle}".`),
            });

            const mainInstruction = `${LOGO_FINDER_PROMPT_BASE(url, siteTitle, maxLogos)}

**Your specific task is to extract logo sources from the HTML and the provided CSS snippets.**
- From HTML: Look for \`<img>\` tags and extract the full value of the \`src\` attribute.
- From CSS: Look in the provided CSS snippets for \`background-image: url(...)\` or \`background: url(...)\` and extract the URL from within.

Return an array of these source URLs or data URIs.`;

            const userMessagePayload = this.createLogoFinderUserMessage(html, screenshotBase64, undefined, cssSnippets);

            const linkExtractOptions = this.options.linkExtractOptions;
            const result = await this.zodLlmLinkQuerier.query(
                mainInstruction,
                userMessagePayload,
                logoScrapingSchema,
                linkExtractOptions
            );

            const foundUrls = result.logoUrls || [];

            // Resolve relative URLs to absolute URLs, and pass data URIs through.
            const absoluteUrls = foundUrls.map(logoUrl => {
                if (logoUrl.startsWith('data:')) {
                    return logoUrl;
                }
                try {
                    // new URL(path, base) handles both absolute and relative paths.
                    return new URL(logoUrl, url).href;
                } catch (e) {
                    // Ignore invalid URLs returned by the LLM.
                    console.warn(`LLM returned an invalid logo URL fragment: "${logoUrl}"`);
                    return null;
                }
            }).filter((u): u is string => u !== null);

            return absoluteUrls;
        } catch (error) {
            console.warn(`LLM-based logo URL extraction failed for ${url}:`, error);
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

            const userMessagePayload = this.createLogoFinderUserMessage(
                html,
                screenshotBase64,
                "Use the screenshot and the provided HTML to identify the selectors for the inline logos."
            );

            const linkExtractOptions = this.options.linkExtractOptions;
            const response = await this.askWeak({
                messages: [
                    { role: "system", content: mainInstruction },
                    { role: "user", content: userMessagePayload }
                ],
                ...linkExtractOptions
            });

            if (!response) {
                return [];
            }

            // Extract JS code from the markdown block
            const match = response.match(/```javascript\n([\s\S]*?)\n```/);
            const jsCode = match ? match[1] : null;

            if (!jsCode) {
                console.warn("LLM did not return a valid JavaScript code block for inline logos.");
                return [];
            }

            const dataUris = await pageHelper.getPage().evaluate(`(${jsCode})()`);

            if (Array.isArray(dataUris)) {
                return dataUris.filter((uri): uri is string => typeof uri === 'string' && uri.startsWith('data:'));
            }

            return [];
        } catch (error) {
            console.warn(`LLM-based inline logo extraction failed for ${url}:`, error);
            return [];
        }
    }

    public async scrape(url: string) {
        const pageHelper = await this.puppeteerHelper.getPageHelper();
        try {
            const resolutions: Resolution[] = [{ width: 1280, height: 800 }];

            // Step 1: Navigate, dismiss cookies, and take a screenshot.
            const { pageHtml, pageCss, siteTitle, screenshotBase64, finalUrl } = await this.eventTracker.trackOperation(
                'load_page_and_screenshot',
                { url },
                async () => {
                    // The pageHelper's setupPage now automatically starts CSS extraction.
                    await pageHelper.navigateToUrl(url, {
                        dismissCookies: true,
                        htmlOnly: false,
                        resolution: resolutions[0]
                    });
                    const pageHtml = await pageHelper.getFinalHtml();
                    const pageCss = await pageHelper.getCss();
                    const siteTitle = await pageHelper.getPage().title();
                    const finalUrl = pageHelper.getPage().url();
                    const screenshots = await pageHelper.takeScreenshots(resolutions);

                    if (!screenshots?.[0]?.screenshotBase64) {
                        throw new Error(`Failed to take screenshot for ${url}`);
                    }
                    const screenshotBase64 = screenshots[0].screenshotBase64;
                    return { pageHtml, pageCss, siteTitle, screenshotBase64, finalUrl };
                }
            );

            url = finalUrl;

            // Step 2: Find and download assets using the same page context.
            // Parse CSS for background images that might be logos
            const cssSnippets = extractBlocksWithBackgroundImage(pageCss);

            // The page is already at the correct URL. Run all logo finders in parallel.
            const faviconUrlsPromise = this.eventTracker.trackOperation(
                'fetch_favicons',
                { url },
                () => this.fetchFavicons(url, pageHtml, pageHelper)
            );
            const logoUrlsPromise = this.eventTracker.trackOperation(
                'find_logo_urls_by_llm',
                { url },
                () => this.findLogoUrlsByLlm(url, pageHtml, siteTitle, screenshotBase64, cssSnippets)
            );
            const inlineLogosPromise = this.eventTracker.trackOperation(
                'find_inline_logos_by_llm',
                { url },
                () => this.findInlineLogosByLlm(url, pageHtml, siteTitle, screenshotBase64, pageHelper)
            );

            const results = await Promise.allSettled([
                faviconUrlsPromise,
                logoUrlsPromise,
                inlineLogosPromise,
            ]);

            const faviconUrls = results[0].status === 'fulfilled' ? (results[0].value as string[]) : [];
            if (results[0].status === 'rejected') console.warn(`Failed to get favicons for ${url}:`, results[0].reason);
            const faviconUrlSet = new Set(faviconUrls);

            const logoUrls = results[1].status === 'fulfilled' ? (results[1].value as string[]) : [];
            if (results[1].status === 'rejected') console.warn(`Failed to get HTML logos for ${url}:`, results[1].reason);

            const inlineLogoDataUris = results[2].status === 'fulfilled' ? (results[2].value as string[]) : [];
            if (results[2].status === 'rejected') console.warn(`Failed to get inline logos for ${url}:`, results[2].reason);

            const allLogoSources = [...new Set([...faviconUrls, ...logoUrls, ...inlineLogoDataUris])];
            const logosToDownload = allLogoSources.slice(0, this.options.maxLogosToAnalyze);
            console.log(`Found ${allLogoSources.length} potential logo URLs, attempting to download up to ${this.options.maxLogosToAnalyze} of them.`);

            const allBase64PngInfo = await this.eventTracker.trackOperation(
                'download_logos',
                { url, logoCount: logosToDownload.length },
                async () => {
                    if (logosToDownload.length === 0) {
                        console.log("No logo URLs found, skipping download.");
                        return [];
                    }

                    const imageUrlToBase64Png = createImageUrlToBase64Png({ fetcher: (fetchUrl) => pageHelper.fetchResourceAsDataWithCache(fetchUrl instanceof Request ? fetchUrl.url : fetchUrl.toString()) });
                    const downloadResults = await Promise.all(logosToDownload.map(async (logoUrlOrDataUri) => {
                        try {
                            const imageInfo = await imageUrlToBase64Png(logoUrlOrDataUri);
                            const isFavicon = faviconUrlSet.has(logoUrlOrDataUri);
                            return { ...imageInfo, isFavicon };
                        } catch (err: any) {
                            const urlSnippet = typeof logoUrlOrDataUri === 'string' ? logoUrlOrDataUri.substring(0, 100) : 'logo';
                            console.warn(`Failed to download or process logo ${urlSnippet}: ${err.message}`);
                            return null;
                        }
                    }));
                    return downloadResults.filter(Boolean) as (Base64PngInfo & { isFavicon: boolean })[];
                }
            );

            // Sort logos by size (area) in descending order to prioritize larger, likely higher-quality logos.
            const sortedLogos = allBase64PngInfo.sort((a, b) => {
                const areaA = (a.width || 0) * (a.height || 0);
                const areaB = (b.width || 0) * (b.height || 0);
                return areaB - areaA;
            });

            // We will now analyze all downloaded logos, or just the screenshot if none were found.
            console.log(`Downloaded ${sortedLogos.length} logos, proceeding to analyze.`);

            // Step 3: Normalize and analyze the logos that were found, using the screenshot for context.
            return this.normalizeLogos(url, sortedLogos, siteTitle, screenshotBase64);
        } catch (error) {
            console.error(`An error occurred during logo and asset processing for ${url}:`, error);
            // Return an empty object on failure so the main scrape can continue.
            return {};
        }
        finally {
            await pageHelper.close();
        }
    }
}

export type BuildLogoScraperFunction = (eventTracker: EventTracker) => AiLogoScraper;
