import { realpathSync } from 'fs';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import puppeteer, { type Browser, type HTTPRequest, type Page } from 'puppeteer';
import type { z } from 'zod';
import {
    BrandAssetScraper,
    type AiBrandFetcher,
    type AiBrandLlm,
    type AiBrandMessage,
    type AiBrandPageLike,
    type AiBrandPromptTextOptions,
    type AnalyzedLogo,
    type BrandColor,
    type LogoScraperResult,
    type PageActionExecutor,
    type PageActionRequest,
    type PageNavigationOptions,
} from '../src/index.js';

const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_MAX_LOGOS = 10;
const DEFAULT_THRESHOLD = 1;

export interface DemoOptions {
    websiteUrl: string;
    outputDir: string;
    model: string;
    apiKey?: string;
    baseURL?: string;
    maxLogosToAnalyze: number;
    brandLogoScoreThreshold: number;
    temperature?: number;
    headless: boolean;
    json: boolean;
}

export interface SaveBrandAssetsOptions {
    result: LogoScraperResult;
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
}

class OpenAiBrandLlm implements AiBrandLlm {
    private readonly client: OpenAI;

    constructor(
        private readonly options: {
            apiKey?: string;
            baseURL?: string;
            model: string;
            temperature?: number;
        }
    ) {
        const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('Missing OpenAI API key. Set OPENAI_API_KEY or pass --api-key.');
        }

        this.client = new OpenAI({
            apiKey,
            baseURL: options.baseURL ?? process.env.OPENAI_BASE_URL,
        });
    }

    async promptZod<TSchema extends z.ZodTypeAny>(
        messages: AiBrandMessage[],
        schema: TSchema
    ): Promise<z.infer<TSchema>> {
        const completion = await this.client.chat.completions.parse({
            model: this.options.model,
            ...(this.options.temperature === undefined ? {} : { temperature: this.options.temperature }),
            messages: [
                {
                    role: 'system',
                    content: 'Return only JSON matching the requested schema.',
                },
                ...messages,
            ],
            response_format: zodResponseFormat(schema, 'brand_asset_result'),
        });

        const parsed = completion.choices[0]?.message.parsed;
        if (!parsed) {
            throw new Error('OpenAI returned no parsed JSON content.');
        }

        return parsed as z.infer<TSchema>;
    }

    async promptText(options: AiBrandPromptTextOptions): Promise<string> {
        const completion = await this.client.chat.completions.create({
            model: this.options.model,
            ...(this.options.temperature === undefined ? {} : { temperature: this.options.temperature }),
            messages: options.messages,
        });

        const content = completion.choices[0]?.message.content;
        if (!content) {
            throw new Error('OpenAI returned no text content.');
        }

        return content;
    }
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

export function parseDemoArgs(argv: string[]): DemoOptions | { help: true } {
    const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
            'api-key': { type: 'string' },
            'base-url': { type: 'string' },
            help: { type: 'boolean', short: 'h' },
            json: { type: 'boolean' },
            'max-logos': { type: 'string' },
            model: { type: 'string' },
            out: { type: 'string', short: 'o' },
            'show-browser': { type: 'boolean' },
            temperature: { type: 'string' },
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
        model: values.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
        apiKey: values['api-key'],
        baseURL: values['base-url'],
        maxLogosToAnalyze: parsePositiveInteger(values['max-logos'], DEFAULT_MAX_LOGOS, '--max-logos'),
        brandLogoScoreThreshold: parsePositiveInteger(values.threshold, DEFAULT_THRESHOLD, '--threshold'),
        temperature: parseOptionalNumber(values.temperature, '--temperature'),
        headless: !values['show-browser'],
        json: values.json ?? false,
    };
}

export async function runDemo(argv = process.argv.slice(2)): Promise<void> {
    const options = parseDemoArgs(argv);
    if ('help' in options) {
        printHelp();
        return;
    }

    const llm = new OpenAiBrandLlm({
        apiKey: options.apiKey,
        baseURL: options.baseURL,
        model: options.model,
        temperature: options.temperature,
    });
    const runtime = await createPuppeteerRuntime({ headless: options.headless });

    try {
        const scraper = new BrandAssetScraper({
            pageExecutor: runtime.pageExecutor,
            analyzeLlm: llm,
            extractLlm: llm,
            fetcher: runtime.fetcher,
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

        const saved = await saveBrandAssets({
            result,
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

    const manifestPath = join(outputDir, 'manifest.json');
    await writeJson(manifestPath, {
        url: options.url,
        downloadedAt: options.downloadedAt ?? new Date().toISOString(),
        primaryColor: options.result.primaryColor,
        brandColors: options.result.brandColors,
        logos,
    });

    return {
        outputDir,
        manifestPath,
        brandColorsPath,
        logos,
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

function parseOptionalNumber(value: string | undefined, label: string): number | undefined {
    if (value === undefined) {
        return undefined;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${label} must be a number.`);
    }
    return parsed;
}

function sanitizePathSegment(value: string): string {
    return value.replace(/[^a-z0-9.-]+/gi, '-').replace(/^-+|-+$/g, '') || 'website';
}

function printHelp(): void {
    console.log(`Usage: pnpm demo <website-url> [options]

Download brand/logo assets from a website into a folder.

Options:
  -o, --out <dir>          Output folder (default: ./brand-assets/<hostname>)
      --model <model>      OpenAI model (default: ${DEFAULT_MODEL})
      --api-key <key>      OpenAI API key (default: OPENAI_API_KEY)
      --base-url <url>     OpenAI-compatible base URL (default: OPENAI_BASE_URL)
      --max-logos <n>      Max logo candidates to analyze (default: ${DEFAULT_MAX_LOGOS})
      --threshold <n>      Minimum brand-logo score to save (default: ${DEFAULT_THRESHOLD})
      --temperature <n>    Model temperature
      --json               Print saved paths as JSON
      --show-browser       Run Puppeteer visibly
  -h, --help               Show help
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
