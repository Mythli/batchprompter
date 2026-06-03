import { realpathSync } from 'fs';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import 'dotenv/config';
import OpenAI from 'openai';
import { createLlm } from 'llm-fns';
import puppeteer, { type Browser, type HTTPRequest, type Page } from 'puppeteer';
import { z } from 'zod';
import {
    BrandAssetScraper,
    WebsiteStyleScraper,
    type AiBrandFetcher,
    type AiBrandPageLike,
    type AnalyzedLogo,
    type BrandColor,
    type ElementScreenshot,
    type InteractiveElementsResult,
    type LogoScraperResult,
    type PageActionExecutor,
    type PageActionRequest,
    type PageNavigationOptions,
} from '../src/index.js';

const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_MAX_LOGOS = 10;
const DEFAULT_THRESHOLD = 1;

const optionalEnvString = z.preprocess(
    value => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().min(1).optional()
);

const demoEnvSchema = z.object({
    OPENAI_API_KEY: z.preprocess(
        value => typeof value === 'string' ? value.trim() : '',
        z.string().min(1, 'OPENAI_API_KEY is required.')
    ),
    OPENAI_BASE_URL: z.preprocess(
        value => typeof value === 'string' && value.trim() === '' ? undefined : value,
        z.string().url('OPENAI_BASE_URL must be a valid URL.').optional()
    ),
    OPENAI_MODEL: optionalEnvString,
}).passthrough();

export type DemoEnv = z.infer<typeof demoEnvSchema>;

export interface DemoCliOptions {
    websiteUrl: string;
    outputDir: string;
    maxLogosToAnalyze: number;
    brandLogoScoreThreshold: number;
    headless: boolean;
    json: boolean;
}

export interface DemoOptions extends DemoCliOptions {
    model: string;
    apiKey: string;
    baseURL?: string;
}

export interface SaveBrandAssetsOptions {
    result: LogoScraperResult;
    styleResult?: InteractiveElementsResult;
    outputDir: string;
    url: string;
    downloadedAt?: string;
}

export interface SavedLogoAsset {
    index: number;
    filename: string;
    path: string;
    metadata: Omit<AnalyzedLogo, 'base64PngData'>;
}

export interface SavedBrandAssets {
    outputDir: string;
    manifestPath: string;
    brandColorsPath: string;
    logos: SavedLogoAsset[];
    interactiveStyle?: SavedInteractiveStyleAssets;
}

export interface SavedInteractiveElementAsset {
    index: number;
    filename: string;
    path: string;
    type: ElementScreenshot['type'];
    state: ElementScreenshot['state'];
    elementIndex: number;
}

export interface SavedInteractiveStyleAssets {
    reportPath: string;
    compositeImagePath?: string;
    screenshots: SavedInteractiveElementAsset[];
}

class MemoryCache {
    private readonly store = new Map<string, { expiresAt: number; value: unknown }>();

    get<T>(key: string): T | undefined {
        const cached = this.store.get(key);
        if (!cached || cached.expiresAt <= Date.now()) {
            this.store.delete(key);
            return undefined;
        }
        return cached.value as T;
    }

    set(key: string, value: unknown, ttl: number): void {
        this.store.set(key, {
            expiresAt: Date.now() + ttl,
            value,
        });
    }
}

class PuppeteerPageActionExecutor implements PageActionExecutor {
    constructor(
        private readonly browser: Browser,
        private readonly cache: MemoryCache,
        private readonly navigationTimeoutMs: number
    ) {}

    async executeOnPage<TResult>(
        request: PageActionRequest<AiBrandPageLike, TResult>
    ): Promise<TResult> {
        if (request.cacheKey) {
            const cached = this.cache.get<TResult>(request.cacheKey);
            if (cached !== undefined) {
                return cached;
            }
        }

        const page = await this.browser.newPage();
        try {
            await setupPage(page, request.navigation);
            await request.beforeNavigate?.(page as unknown as AiBrandPageLike);

            await page.goto(request.url, {
                waitUntil: request.navigation?.htmlOnly ? 'domcontentloaded' : 'networkidle0',
                timeout: this.navigationTimeoutMs,
            });

            if (request.navigation?.dismissCookies) {
                await dismissCookieBanners(page);
            }

            const result = await request.action(page as unknown as AiBrandPageLike);
            if (request.cacheKey && request.ttl) {
                this.cache.set(request.cacheKey, result, request.ttl);
            }

            return result;
        } finally {
            await page.close();
        }
    }
}

export function parseDemoEnv(env: NodeJS.ProcessEnv = process.env): DemoEnv {
    const parsed = demoEnvSchema.safeParse(env);
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map(issue => `- ${issue.path.join('.')}: ${issue.message}`)
            .join('\n');
        throw new Error(`Invalid demo environment:\n${issues}`);
    }

    return parsed.data;
}

export function parseDemoArgs(argv: string[]): DemoCliOptions | { help: true } {
    const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
            help: { type: 'boolean', short: 'h' },
            json: { type: 'boolean' },
            'max-logos': { type: 'string' },
            out: { type: 'string', short: 'o' },
            'show-browser': { type: 'boolean' },
            threshold: { type: 'string' },
        },
    });

    if (values.help) {
        return { help: true };
    }

    const websiteArg = positionals[0];
    if (!websiteArg) {
        throw new Error('Missing website URL.');
    }

    const websiteUrl = normalizeWebsiteUrl(websiteArg);
    return {
        websiteUrl,
        outputDir: resolve(values.out ?? defaultOutputDir(websiteUrl)),
        maxLogosToAnalyze: parsePositiveInteger(values['max-logos'], DEFAULT_MAX_LOGOS, '--max-logos'),
        brandLogoScoreThreshold: parsePositiveInteger(values.threshold, DEFAULT_THRESHOLD, '--threshold'),
        headless: !values['show-browser'],
        json: values.json ?? false,
    };
}

export function resolveDemoOptions(cliOptions: DemoCliOptions, env: DemoEnv): DemoOptions {
    return {
        ...cliOptions,
        apiKey: env.OPENAI_API_KEY,
        baseURL: env.OPENAI_BASE_URL,
        model: env.OPENAI_MODEL ?? DEFAULT_MODEL,
    };
}

export async function runDemo(argv = process.argv.slice(2)): Promise<void> {
    const cliOptions = parseDemoArgs(argv);
    if ('help' in cliOptions) {
        printHelp();
        return;
    }

    const options = resolveDemoOptions(cliOptions, parseDemoEnv());
    const openai = new OpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseURL,
    });
    const llm = createLlm({
        openai,
        defaultModel: options.model,
    });
    const runtime = await createPuppeteerRuntime({ headless: options.headless });

    try {
        const scraper = new BrandAssetScraper({
            pageExecutor: runtime.pageExecutor,
            analyzeLlm: llm,
            extractLlm: llm,
            fetcher: runtime.fetcher,
        });
        const styleScraper = new WebsiteStyleScraper({
            pageExecutor: runtime.pageExecutor,
            defaultOptions: {
                createCompositeImage: true,
                maxButtons: 3,
                maxInputs: 3,
                maxLinks: 3,
            },
        });

        scraper.events.on('logo:found', event => {
            console.error(`Found ${event.count} logo candidates.`);
        });
        scraper.events.on('logo:downloaded', event => {
            console.error(`Downloaded candidate ${event.index + 1}.`);
        });
        scraper.events.on('analysis:complete', event => {
            console.error(`Analysis complete: ${event.logos.length} logo assets kept.`);
        });

        const result = await scraper.scrape({
            url: options.websiteUrl,
            maxLogosToAnalyze: options.maxLogosToAnalyze,
            brandLogoScoreThreshold: options.brandLogoScoreThreshold,
        });
        console.error('Capturing interactive element styles.');
        const styleResult = await styleScraper.scrape({
            url: options.websiteUrl,
        });

        const saved = await saveBrandAssets({
            result,
            styleResult,
            outputDir: options.outputDir,
            url: options.websiteUrl,
        });

        if (options.json) {
            console.log(JSON.stringify(saved, null, 2));
            return;
        }

        console.log(`Saved ${saved.logos.length} logo assets to ${saved.outputDir}`);
        console.log(`Manifest: ${saved.manifestPath}`);
        console.log(`Brand colors: ${saved.brandColorsPath}`);
        console.log(`Interactive styles: ${saved.interactiveStyle?.reportPath}`);
    } finally {
        await runtime.cleanup();
    }
}

export async function saveBrandAssets(options: SaveBrandAssetsOptions): Promise<SavedBrandAssets> {
    const outputDir = resolve(options.outputDir);
    await mkdir(outputDir, { recursive: true });

    const logos: SavedLogoAsset[] = [];
    for (const [index, logo] of options.result.logos.entries()) {
        const filename = createLogoFilename(index, logo);
        const filePath = join(outputDir, filename);
        await writeFile(filePath, pngBufferFromDataUri(logo.base64PngData));

        const { base64PngData: _base64PngData, ...metadata } = logo;
        logos.push({
            index,
            filename,
            path: filePath,
            metadata,
        });
    }

    const brandColorsPath = join(outputDir, 'brand-colors.json');
    await writeJson(brandColorsPath, {
        primaryColor: options.result.primaryColor,
        brandColors: options.result.brandColors,
    } satisfies {
        primaryColor?: BrandColor;
        brandColors: BrandColor[];
    });

    const interactiveStyle = options.styleResult
        ? await saveInteractiveStyleAssets({
            result: options.styleResult,
            outputDir,
        })
        : undefined;

    const manifestPath = join(outputDir, 'manifest.json');
    await writeJson(manifestPath, {
        url: options.url,
        downloadedAt: options.downloadedAt ?? new Date().toISOString(),
        primaryColor: options.result.primaryColor,
        brandColors: options.result.brandColors,
        logos,
        interactiveStyle,
    });

    return {
        outputDir,
        manifestPath,
        brandColorsPath,
        logos,
        interactiveStyle,
    };
}

export async function saveInteractiveStyleAssets(options: {
    result: InteractiveElementsResult;
    outputDir: string;
}): Promise<SavedInteractiveStyleAssets> {
    const outputDir = resolve(options.outputDir);
    const elementsDir = join(outputDir, 'interactive-elements');
    await mkdir(elementsDir, { recursive: true });

    let compositeImagePath: string | undefined;
    if (options.result.compositeImageBase64) {
        compositeImagePath = join(elementsDir, 'composite.png');
        await writeFile(compositeImagePath, pngBufferFromDataUri(options.result.compositeImageBase64));
    }

    const screenshots: SavedInteractiveElementAsset[] = [];
    for (const [index, screenshot] of options.result.screenshots.entries()) {
        const filename = createInteractiveElementFilename(index, screenshot);
        const filePath = join(elementsDir, filename);
        await writeFile(filePath, pngBufferFromDataUri(screenshot.screenshotBase64));
        screenshots.push({
            index,
            filename,
            path: filePath,
            type: screenshot.type,
            state: screenshot.state,
            elementIndex: screenshot.elementIndex,
        });
    }

    const reportPath = join(outputDir, 'interactive-styles.md');
    await writeFile(reportPath, formatInteractiveStylesMarkdown(options.result), 'utf8');

    return {
        reportPath,
        compositeImagePath,
        screenshots,
    };
}

export function normalizeWebsiteUrl(value: string): string {
    const trimmed = value.trim();
    if (/^https?:\/\//i.test(trimmed)) {
        return new URL(trimmed).href;
    }
    return new URL(`https://${trimmed}`).href;
}

export function defaultOutputDir(websiteUrl: string): string {
    const hostname = new URL(websiteUrl).hostname || 'website';
    return resolve(process.cwd(), 'brand-assets', sanitizePathSegment(hostname));
}

async function createPuppeteerRuntime(
    options: { headless?: boolean; navigationTimeoutMs?: number } = {}
): Promise<{
    fetcher: AiBrandFetcher;
    pageExecutor: PageActionExecutor;
    cleanup(): Promise<void>;
}> {
    const userDataDir = await mkdtemp(join(tmpdir(), 'ai-brand-assets-'));
    const browser = await puppeteer.launch({
        headless: options.headless ?? true,
        pipe: true,
        userDataDir,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const cache = new MemoryCache();

    return {
        fetcher: ((url: string | URL | Request, requestOptions?: RequestInit) =>
            globalThis.fetch(url, requestOptions)) as AiBrandFetcher,
        pageExecutor: new PuppeteerPageActionExecutor(
            browser,
            cache,
            options.navigationTimeoutMs ?? 45000
        ),
        async cleanup() {
            await browser.close();
            await rm(userDataDir, { recursive: true, force: true });
        },
    };
}

async function setupPage(page: Page, navigation?: PageNavigationOptions): Promise<void> {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport(navigation?.resolution ?? { width: 1280, height: 800 });
    page.on('dialog', async dialog => {
        await dialog.dismiss();
    });

    if (navigation?.htmlOnly) {
        await page.setRequestInterception(true);
        page.on('request', (request: HTTPRequest) => {
            if (['stylesheet', 'font', 'image', 'media'].includes(request.resourceType())) {
                request.abort().catch(() => {});
                return;
            }
            request.continue().catch(() => {});
        });
    }
}

async function dismissCookieBanners(page: Page): Promise<void> {
    const buttons = await page.$$('button, a, [role="button"]');
    for (const button of buttons) {
        try {
            const text = await button.evaluate(node => node.textContent?.trim() ?? '');
            const shouldClick = /accept|agree|consent|allow|got it|close/i.test(text)
                && await button.isIntersectingViewport();
            if (shouldClick) {
                await button.click();
            }
        } catch {
            // Cookie banners vary wildly. Ignore stale or non-clickable elements.
        }
    }
}

function createLogoFilename(index: number, logo: AnalyzedLogo): string {
    const ordinal = String(index + 1).padStart(2, '0');
    const role = logo.isFavicon ? '-favicon' : '';
    const score = Number.isFinite(logo.brandLogoScore) ? `-score-${logo.brandLogoScore}` : '';
    return `logo-${ordinal}${role}${score}.png`;
}

function createInteractiveElementFilename(index: number, screenshot: ElementScreenshot): string {
    const ordinal = String(index + 1).padStart(2, '0');
    const elementIndex = String(screenshot.elementIndex).padStart(2, '0');
    return `${ordinal}-${screenshot.type}-${elementIndex}-${screenshot.state}.png`;
}

function formatInteractiveStylesMarkdown(result: InteractiveElementsResult): string {
    if (result.screenshots.length === 0) {
        return '# Extracted Interactive Element Styles\n\nNo interactive elements found.\n';
    }

    const sections = result.screenshots.map(screenshot => {
        const styles = screenshot.styles.trim() || '/* No non-default computed styles captured. */';
        return `## ${screenshot.type} #${screenshot.elementIndex} (${screenshot.state})\n\n\`\`\`css\n${styles}\n\`\`\``;
    });

    return `# Extracted Interactive Element Styles\n\n${sections.join('\n\n')}\n`;
}

function pngBufferFromDataUri(dataUri: string): Buffer {
    const match = dataUri.match(/^data:image\/png;base64,(.+)$/);
    if (!match?.[1]) {
        throw new Error('Expected a PNG data URI.');
    }
    return Buffer.from(match[1], 'base64');
}

async function writeJson(path: string, value: unknown): Promise<void> {
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function parsePositiveInteger(value: string | undefined, fallback: number, label: string): number {
    if (value === undefined) {
        return fallback;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${label} must be a positive integer.`);
    }
    return parsed;
}

function sanitizePathSegment(value: string): string {
    return value.replace(/[^a-z0-9.-]+/gi, '-').replace(/^-+|-+$/g, '') || 'website';
}

function printHelp(): void {
    console.log(`Usage: pnpm demo <website-url> [options]

Download brand/logo assets and interactive design captures from a website into a folder.

Options:
  -o, --out <dir>          Output folder (default: ./brand-assets/<hostname>)
      --max-logos <n>      Max logo candidates to analyze (default: ${DEFAULT_MAX_LOGOS})
      --threshold <n>      Minimum brand-logo score to save (default: ${DEFAULT_THRESHOLD})
      --json               Print saved paths as JSON
      --show-browser       Run Puppeteer visibly
  -h, --help               Show help

OpenAI config is read from .env or the process environment:
  OPENAI_API_KEY           Required
  OPENAI_BASE_URL          Optional OpenAI-compatible base URL
  OPENAI_MODEL             Optional model (default: ${DEFAULT_MODEL})

The demo writes PNG assets, brand-colors.json, manifest.json, interactive-styles.md,
and interactive-elements/*.png. It does not write raw stylesheet files.
`);
}

function isDirectDemo(): boolean {
    if (!process.argv[1]) {
        return false;
    }

    try {
        return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
    }
}

if (isDirectDemo()) {
    runDemo().catch(error => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
}
