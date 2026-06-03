import type OpenAI from 'openai';
import { z } from 'zod';
import { EventEmitter } from 'eventemitter3';
import { compressHtml } from '../utils/compressHtml.js';
import { CssParser } from './CssParser.js';
import { ImageDownloader, ImageConversionResult } from './ImageDownloader.js';
import { CssCollector, fetchFavicons, getFinalHtml, takeScreenshots } from '../page/pageCapture.js';
import type { AiBrandFetcher, AiBrandLlm, AiBrandMessage, AiBrandPageLike, PageActionExecutor, Resolution } from '../types.js';

export interface LogoScraperOptions {
    maxLogosToAnalyze?: number;
    brandLogoScoreThreshold?: number;
}

export interface BrandAssetScrapeInput extends LogoScraperOptions {
    url: string;
}

export interface BrandAssetScraperDeps {
    pageExecutor: PageActionExecutor;
    analyzeLlm: AiBrandLlm;
    extractLlm?: AiBrandLlm;
    fetcher?: AiBrandFetcher;
    imageDownloader?: ImageDownloader;
    defaultOptions?: LogoScraperOptions;
}

interface ResolvedLogoScraperOptions {
    maxLogosToAnalyze: number;
    brandLogoScoreThreshold: number;
}

export interface BrandColor {
    hex: string;
    isDark: boolean;
    contrastColor: string;
}

export interface AnalyzedLogo extends ImageConversionResult {
    isFavicon: boolean;
    brandLogoScore: number;
    duplicateOfIndex: number | null;
    darkBackgroundPerformance?: number;
    lightBackgroundPerformance?: number;
    originalIndex: number;
}

export interface LogoScraperResult {
    primaryColor?: BrandColor;
    brandColors: BrandColor[];
    logos: AnalyzedLogo[];
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

function userMessage(content: OpenAI.Chat.Completions.ChatCompletionContentPart[]): AiBrandMessage[] {
    return [{ role: 'user', content }];
}

export class BrandAssetScraper {
    public readonly events = new EventEmitter();
    private readonly pageExecutor: PageActionExecutor;
    private readonly analyzeLlm: AiBrandLlm;
    private readonly extractLlm: AiBrandLlm;
    private readonly imageDownloader: ImageDownloader;
    private readonly defaultOptions: LogoScraperOptions;

    constructor(deps: BrandAssetScraperDeps) {
        const fetcher = deps.fetcher ?? globalThis.fetch;
        this.pageExecutor = deps.pageExecutor;
        this.analyzeLlm = deps.analyzeLlm;
        this.extractLlm = deps.extractLlm ?? deps.analyzeLlm;
        this.imageDownloader = deps.imageDownloader ?? new ImageDownloader({ fetcher });
        this.defaultOptions = deps.defaultOptions ?? {};
    }

    public async scrape(input: BrandAssetScrapeInput): Promise<LogoScraperResult> {
        const { url: inputUrl, ...inputOptions } = input;
        let url = inputUrl;
        const options = this.resolveOptions({
            ...this.defaultOptions,
            ...inputOptions,
        });

        try {
            const resolutions: Resolution[] = [{ width: 1280, height: 800 }];
            let cssCollector: CssCollector | undefined;

            // Step 1: Navigate, dismiss cookies, and take a screenshot.
            const {
                pageHtml,
                pageCss,
                siteTitle,
                screenshotBase64,
                finalUrl,
                faviconUrls,
                inlineLogoDataUris,
            } = await this.pageExecutor.executeOnPage({
                url,
                cacheKey: this.getCaptureCacheKey(url, options),
                ttl: 3600 * 1000,
                navigation: {
                    dismissCookies: true,
                    htmlOnly: false,
                    resolution: resolutions[0],
                },
                beforeNavigate: async (page) => {
                    cssCollector = await CssCollector.start(page);
                },
                action: async (page) => {
                    try {
                        const pageHtml = await getFinalHtml(page);
                        const pageCss = cssCollector ? await cssCollector.getCss() : [];
                        const siteTitle = await page.title();
                        const finalUrl = page.url();
                        const screenshots = await takeScreenshots(page, resolutions);

                        if (!screenshots?.[0]?.screenshotBase64) {
                            throw new Error(`Failed to take screenshot for ${url}`);
                        }
                        const screenshotBase64 = screenshots[0].screenshotBase64;
                        const [faviconUrls, inlineLogoDataUris] = await Promise.all([
                            fetchFavicons(finalUrl, page),
                            this.findInlineLogosByLlm(finalUrl, pageHtml, siteTitle, screenshotBase64, page, options),
                        ]);

                        return {
                            pageHtml,
                            pageCss,
                            siteTitle,
                            screenshotBase64,
                            finalUrl,
                            faviconUrls,
                            inlineLogoDataUris,
                        };
                    } finally {
                        if (cssCollector) {
                            await cssCollector.dispose();
                            cssCollector = undefined;
                        }
                    }
                },
            });

            url = finalUrl;

            // Step 2: Find and download assets using the same page context.
            const cssSnippets = CssParser.extractBlocksWithBackgroundImage(pageCss);

            // Run all logo finders in parallel.
            const logoUrlsPromise = this.findLogoUrlsByLlm(url, pageHtml, siteTitle, screenshotBase64, cssSnippets, options);

            const results = await Promise.allSettled([
                logoUrlsPromise,
            ]);

            const faviconUrlSet = new Set(faviconUrls);

            const logoUrls = results[0].status === 'fulfilled' ? (results[0].value as string[]) : [];

            const allLogoSources = [...new Set([...faviconUrls, ...logoUrls, ...inlineLogoDataUris])];
            const logosToDownload = allLogoSources.slice(0, options.maxLogosToAnalyze);

            console.log(`[BrandAssetScraper] Found ${allLogoSources.length} potential logo URLs. Downloading ${logosToDownload.length}...`);
            this.events.emit('logo:found', { count: allLogoSources.length, urls: allLogoSources });

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
            
            validLogos.forEach((logo, index) => {
                this.events.emit('logo:downloaded', { index, originalUrl: logo.originalUrl, base64PngData: logo.base64PngData });
            });

            // Sort logos by size (area) in descending order
            const sortedLogos = validLogos.sort((a, b) => {
                const areaA = (a.width || 0) * (a.height || 0);
                const areaB = (b.width || 0) * (b.height || 0);
                return areaB - areaA;
            });

            console.log(`[BrandAssetScraper] Analyzing ${sortedLogos.length} downloaded logos...`);

            // Step 3: Normalize and analyze
            const finalResult = await this.normalizeLogos(url, sortedLogos, siteTitle, screenshotBase64, options);
            this.events.emit('analysis:complete', finalResult);
            
            return finalResult;

        } catch (error) {
            console.error(`[BrandAssetScraper] Error processing ${url}:`, error);
            return { brandColors: [], logos: [] };
        }
    }

    private resolveOptions(options: LogoScraperOptions): ResolvedLogoScraperOptions {
        return {
            maxLogosToAnalyze: options.maxLogosToAnalyze ?? 10,
            brandLogoScoreThreshold: options.brandLogoScoreThreshold ?? 5,
        };
    }

    private getCaptureCacheKey(url: string, options: ResolvedLogoScraperOptions): string {
        return `ai-brand-scraper:brand-assets:capture:${url}:max-${options.maxLogosToAnalyze}`;
    }

    private async findLogoUrlsByLlm(url: string, html: string, siteTitle: string, screenshotBase64: string, cssSnippets: string, options: ResolvedLogoScraperOptions): Promise<string[]> {
        try {
            const maxLogos = options.maxLogosToAnalyze;
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

            const result = await this.extractLlm.promptZod(userMessage(userMessagePayload), logoScrapingSchema);

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
            console.warn(`[BrandAssetScraper] LLM logo extraction failed:`, error);
            return [];
        }
    }

    private async findInlineLogosByLlm(url: string, html: string, siteTitle: string, screenshotBase64: string, page: AiBrandPageLike, options: ResolvedLogoScraperOptions): Promise<string[]> {
        try {
            const maxLogos = options.maxLogosToAnalyze;
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

            const response = await this.extractLlm.promptText({ messages: userMessage(userMessagePayload) });

            const match = response.match(/```javascript\n([\s\S]*?)\n```/);
            const jsCode = match ? match[1] : null;

            if (!jsCode) return [];

            const dataUris = await page.evaluate(`(${jsCode})()`);

            if (Array.isArray(dataUris)) {
                return dataUris.filter((uri): uri is string => typeof uri === 'string' && uri.startsWith('data:'));
            }

            return [];
        } catch (error) {
            console.warn(`[BrandAssetScraper] Inline logo extraction failed:`, error);
            return [];
        }
    }

    private async normalizeLogos(baseUrl: string, base64Logos: Array<ImageConversionResult & { isFavicon: boolean }>, siteTitle: string, screenshotBase64: string, options: ResolvedLogoScraperOptions): Promise<LogoScraperResult> {
        if (base64Logos.length === 0) {
            // Still try to get brand colors from screenshot
            try {
                const colorOnlySchema = z.object({
                    brandColors: z.array(brandColorSchema)
                        .min(1)
                        .max(5)
                        .describe("An array of up to 5 colors that represent the company's brand. The first color MUST be the primary brand color."),
                });

                const colorPrompt: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
                    { type: "text", text: `Analyze the screenshot and identify the brand colors for "${siteTitle}".` },
                    { type: "image_url", image_url: { url: screenshotBase64, detail: "low" } }
                ];

                const colorResult = await this.analyzeLlm.promptZod(userMessage(colorPrompt), colorOnlySchema);
                const brandColors = colorResult.brandColors || [];
                const primaryColor = brandColors.length > 0 ? brandColors[0] : undefined;

                return { primaryColor, brandColors, logos: [] };
            } catch (e) {
                return { brandColors: [], logos: [] };
            }
        }

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

        userMessagePayload.push({ type: "text", text: "\n\nPotential logo images to analyze:" });
        base64Logos.forEach((logo, index) => {
            userMessagePayload.push({ type: "text", text: `Image ${index + 1} (${logo.width}x${logo.height}px)${logo.isFavicon ? ' (Favicon)' : ''}:` });
            userMessagePayload.push({ type: "image_url", image_url: { url: logo.base64PngData, detail: "low" } });
        });

        const logoMetaData = await this.analyzeLlm.promptZod(userMessage(userMessagePayload), analyseLogosSchema);

        const brandColors = logoMetaData.brandColors || [];

        // Combine original logo info with LLM analysis
        const allLogoData: AnalyzedLogo[] = base64Logos.map((logo, i) => ({
            ...logo,
            ...logoMetaData.logos[i],
            originalIndex: i
        }));

        // Deduplicate
        const logoGroups: { [key: number]: AnalyzedLogo[] } = {};
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
        const brandLogos = uniqueHighestResLogos.filter(logo => logo.brandLogoScore >= options.brandLogoScoreThreshold);

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
