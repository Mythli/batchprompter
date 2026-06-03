import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import puppeteer, { Browser, HTTPRequest, Page } from 'puppeteer';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
    AiBrandScraper,
    type AiBrandFetcher,
    type AiBrandLlm,
    type AiBrandMessage,
    type AiBrandPageLike,
    type PageActionExecutor,
    type PageNavigationOptions,
} from '../../src/index.js';

class MemoryCache {
    private store = new Map<string, any>();
    public hits = 0;
    public sets = 0;

    async get<T>(key: string): Promise<T | undefined> {
        const value = this.store.get(key);
        if (value !== undefined) {
            this.hits++;
        }
        return value;
    }

    async set(key: string, value: any): Promise<void> {
        this.sets++;
        this.store.set(key, value);
    }
}

class PuppeteerPageActionExecutor implements PageActionExecutor {
    public pagesOpened = 0;
    public pagesClosed = 0;
    public navigations = 0;
    public sawBeforeNavigateBeforeGoto = false;

    constructor(
        private browser: Browser,
        private cache: MemoryCache
    ) {}

    async executeOnPage<TResult>({
        url,
        cacheKey,
        navigation,
        beforeNavigate,
        action,
    }: Parameters<PageActionExecutor['executeOnPage']>[0]): Promise<TResult> {
        if (cacheKey) {
            const cached = await this.cache.get<TResult>(cacheKey);
            if (cached !== undefined) {
                return cached;
            }
        }

        const page = await this.browser.newPage();
        this.pagesOpened++;
        let beforeNavigateFinished = false;

        try {
            await setupPage(page, navigation);

            if (beforeNavigate) {
                await beforeNavigate(page as unknown as AiBrandPageLike);
                beforeNavigateFinished = true;
            }

            this.sawBeforeNavigateBeforeGoto = beforeNavigate ? beforeNavigateFinished : this.sawBeforeNavigateBeforeGoto;
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            this.navigations++;

            if (navigation?.dismissCookies) {
                await dismissCookieBanners(page);
            }

            const result = await action(page as unknown as AiBrandPageLike);
            if (cacheKey) {
                await this.cache.set(cacheKey, result);
            }
            return result;
        } finally {
            await page.close();
            this.pagesClosed++;
        }
    }
}

class FixtureLlm implements AiBrandLlm {
    public sawCssLogoInPrompt = false;

    constructor(private baseUrl: string) {}

    async promptZod<TSchema extends z.ZodTypeAny>(
        messages: AiBrandMessage[],
        schema: TSchema
    ): Promise<z.infer<TSchema>> {
        const content = JSON.stringify(messages);

        if (content.includes('Your specific task is to extract logo sources')) {
            this.sawCssLogoInPrompt = content.includes('/logo-bg.svg');
            return schema.parse({
                logoUrls: this.sawCssLogoInPrompt
                    ? [`${this.baseUrl}/logo.svg`, `${this.baseUrl}/logo-bg.svg`]
                    : [`${this.baseUrl}/logo.svg`],
            });
        }

        if (content.includes('Potential logo images to analyze')) {
            const count = (content.match(/Image \d+/g) ?? []).length;
            return schema.parse({
                brandColors: [
                    { hex: '#0b5fff', isDark: true, contrastColor: '#ffffff' },
                    { hex: '#16a34a', isDark: true, contrastColor: '#ffffff' },
                ],
                logos: Array.from({ length: count }, () => ({
                    brandLogoScore: 9,
                    duplicateOfIndex: null,
                    darkBackgroundPerformance: 8,
                    lightBackgroundPerformance: 9,
                })),
            });
        }

        return schema.parse({
            brandColors: [
                { hex: '#0b5fff', isDark: true, contrastColor: '#ffffff' },
            ],
        });
    }

    async promptText(options: { messages: AiBrandMessage[] }): Promise<string> {
        const content = JSON.stringify(options);
        expect(content).toContain('write a JavaScript function to extract INLINE logos');

        return `\`\`\`javascript
async () => {
  return Array.from(document.querySelectorAll('[data-testid="inline-logo"]')).map((el) => {
    const serialized = new XMLSerializer().serializeToString(el);
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(serialized)));
  });
}
\`\`\``;
    }
}

type FixtureServer = {
    baseUrl: string;
    requests: Map<string, number>;
    close(): Promise<void>;
};

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="60" viewBox="0 0 180 60"><rect width="180" height="60" rx="8" fill="#0b5fff"/><text x="18" y="39" font-size="28" font-family="Arial" fill="#fff">Acme</text></svg>`;
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#16a34a"/><path d="M8 22 L16 6 L24 22 Z" fill="#fff"/></svg>`;
const backgroundLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="42" fill="#f59e0b"/><path d="M30 58 L48 24 L66 58 Z" fill="#111827"/></svg>`;

async function startFixtureServer(): Promise<FixtureServer> {
    const requests = new Map<string, number>();
    let baseUrl = '';

    const server = createServer((req, res) => {
        const url = req.url ?? '/';
        requests.set(url, (requests.get(url) ?? 0) + 1);

        if (url === '/' || url === '/index.html') {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(`<!doctype html>
<html>
  <head>
    <title>Acme Fixture</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="/">
        <img class="brand-logo" src="/logo.svg" alt="Acme Fixture logo">
        <svg data-testid="inline-logo" class="inline-logo" xmlns="http://www.w3.org/2000/svg" width="140" height="44" viewBox="0 0 140 44">
          <rect width="140" height="44" rx="8" fill="#111827"></rect>
          <text x="16" y="30" font-size="22" font-family="Arial" fill="#ffffff">Inline</text>
        </svg>
      </a>
    </header>
    <main>
      <section id="controls">
        <div class="css-logo" aria-label="CSS logo"></div>
        <button class="primary-button"><span>Get Started</span></button>
        <input class="email-input" placeholder="Email address">
        <a class="plain-link" href="/about"><span>Pricing</span></a>
      </section>
    </main>
  </body>
</html>`);
            return;
        }

        if (url === '/styles.css') {
            res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
            res.end(`
body { margin: 0; font-family: Arial, sans-serif; background: #f8fafc; color: #111827; }
.site-header { padding: 24px 36px; background: #ffffff; border-bottom: 1px solid #d1d5db; }
.brand { display: inline-flex; align-items: center; gap: 18px; color: #0b5fff; text-decoration: none; }
.brand-logo { width: 180px; height: 60px; }
#controls { display: grid; gap: 22px; width: 360px; padding: 40px; }
.css-logo { width: 96px; height: 96px; background-image: url("${baseUrl}/logo-bg.svg"); background-size: contain; }
.primary-button { width: 180px; min-height: 48px; border: 0; border-radius: 6px; background: #0b5fff; color: white; font-size: 16px; }
.primary-button:hover { background: #063da8; }
.email-input { width: 260px; min-height: 42px; border: 2px solid #94a3b8; border-radius: 4px; padding: 0 12px; font-size: 16px; }
.email-input:hover, .email-input:focus { border-color: #0b5fff; outline: 3px solid #bfdbfe; }
.plain-link { width: 120px; color: #0b5fff; font-weight: 700; text-decoration: underline; }
.plain-link:hover { color: #063da8; }
`);
            return;
        }

        if (url === '/logo.svg') {
            res.writeHead(200, { 'content-type': 'image/svg+xml' });
            res.end(logoSvg);
            return;
        }

        if (url === '/favicon.svg') {
            res.writeHead(200, { 'content-type': 'image/svg+xml' });
            res.end(faviconSvg);
            return;
        }

        if (url === '/logo-bg.svg') {
            res.writeHead(200, { 'content-type': 'image/svg+xml' });
            res.end(backgroundLogoSvg);
            return;
        }

        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
    });

    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const address = server.address() as AddressInfo;
            baseUrl = `http://127.0.0.1:${address.port}`;
            resolve();
        });
    });

    return {
        baseUrl,
        requests,
        close: () => closeServer(server),
    };
}

async function setupPage(page: Page, navigation?: PageNavigationOptions): Promise<void> {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport(navigation?.resolution ?? { width: 1920, height: 1080 });
    page.on('dialog', async (dialog) => {
        await dialog.dismiss();
    });

    if (navigation?.htmlOnly) {
        await page.setRequestInterception(true);
        page.on('request', (request: HTTPRequest) => {
            if (['stylesheet', 'font', 'image', 'media'].includes(request.resourceType())) {
                request.abort().catch(() => {});
            } else {
                request.continue().catch(() => {});
            }
        });
    }
}

async function dismissCookieBanners(page: Page): Promise<void> {
    const buttons = await page.$$('button, a, [role="button"]');
    for (const button of buttons) {
        try {
            const text = await button.evaluate(node => node.textContent?.trim() ?? '');
            if (/accept|agree|consent|allow|got it|close/i.test(text) && await button.isIntersectingViewport()) {
                await button.click();
            }
        } catch {}
    }
}

function closeServer(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
}

async function createBrowserExecutor(cache: MemoryCache) {
    const userDataDir = await mkdtemp(join(tmpdir(), 'ai-brand-scraper-e2e-browser-'));
    const browser = await puppeteer.launch({
        headless: true,
        pipe: true,
        userDataDir,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const pageExecutor = new PuppeteerPageActionExecutor(browser, cache);
    const fetcher = ((url: string | URL | Request, options?: RequestInit) =>
        globalThis.fetch(url, options)) as AiBrandFetcher;

    return {
        fetcher,
        pageExecutor,
        async cleanup() {
            await browser.close();
            await rm(userDataDir, { recursive: true, force: true });
        },
    };
}

describe('ai-brand-scraper browser contract', () => {
    it('scrapes brand assets through the public class with a minimal page executor', async () => {
        const fixture = await startFixtureServer();
        const cache = new MemoryCache();
        const browser = await createBrowserExecutor(cache);
        const llm = new FixtureLlm(fixture.baseUrl);
        const events: string[] = [];

        try {
            const scraper = new AiBrandScraper({
                pageExecutor: browser.pageExecutor,
                analyzeLlm: llm,
                fetcher: browser.fetcher,
            });

            scraper.events.on('logo:found', () => events.push('found'));
            scraper.events.on('logo:downloaded', () => events.push('downloaded'));
            scraper.events.on('analysis:complete', () => events.push('analysis'));

            const first = await scraper.scrapeBrandAssets({
                url: fixture.baseUrl,
                maxLogosToAnalyze: 6,
                brandLogoScoreThreshold: 5,
            });
            const rootRequestsAfterFirstRun = fixture.requests.get('/') ?? 0;
            const second = await scraper.scrapeBrandAssets({
                url: fixture.baseUrl,
                maxLogosToAnalyze: 6,
                brandLogoScoreThreshold: 5,
            });

            const firstUrls = first.logos.map(logo => logo.originalUrl);
            const secondUrls = second.logos.map(logo => logo.originalUrl);

            expect(first.brandColors[0]?.hex).toBe('#0b5fff');
            expect(first.logos.some(logo => logo.base64PngData.startsWith('data:image/png;base64,'))).toBe(true);
            expect(firstUrls).toContain(`${fixture.baseUrl}/logo-bg.svg`);
            expect(firstUrls).toContain(`${fixture.baseUrl}/favicon.svg`);
            expect(firstUrls.some(url => url.startsWith('data:image/svg+xml;base64,'))).toBe(true);
            expect(secondUrls.sort()).toEqual(firstUrls.sort());
            expect(llm.sawCssLogoInPrompt).toBe(true);

            expect(browser.pageExecutor.sawBeforeNavigateBeforeGoto).toBe(true);
            expect(browser.pageExecutor.navigations).toBe(1);
            expect(browser.pageExecutor.pagesOpened).toBe(1);
            expect(browser.pageExecutor.pagesClosed).toBe(1);
            expect(cache.hits).toBeGreaterThanOrEqual(1);
            expect(fixture.requests.get('/') ?? 0).toBe(rootRequestsAfterFirstRun);

            expect(events).toContain('found');
            expect(events).toContain('downloaded');
            expect(events).toContain('analysis');
        } finally {
            await browser.cleanup();
            await fixture.close();
        }
    }, 60000);

    it('scrapes website style through the public class with a minimal page executor', async () => {
        const fixture = await startFixtureServer();
        const cache = new MemoryCache();
        const browser = await createBrowserExecutor(cache);
        const llm = new FixtureLlm(fixture.baseUrl);

        try {
            const scraper = new AiBrandScraper({
                pageExecutor: browser.pageExecutor,
                analyzeLlm: llm,
                fetcher: browser.fetcher,
            });

            const result = await scraper.scrapeWebsiteStyle({
                url: fixture.baseUrl,
                maxButtons: 1,
                maxInputs: 1,
                maxLinks: 1,
                createCompositeImage: true,
            });

            const elementTypes = new Set(result.screenshots.map(element => element.type));
            const elementStates = new Set(result.screenshots.map(element => element.state));

            expect(elementTypes).toEqual(new Set(['button', 'input', 'link']));
            expect(elementStates.has('normal')).toBe(true);
            expect(elementStates.has('hover')).toBe(true);
            expect(elementStates.has('focus')).toBe(true);
            expect(result.screenshots.every(element => element.screenshotBase64.startsWith('data:image/png;base64,'))).toBe(true);
            expect(result.screenshots.every(element => typeof element.styles === 'string')).toBe(true);
            expect(result.compositeImageBase64?.startsWith('data:image/png;base64,')).toBe(true);
            expect(browser.pageExecutor.pagesOpened).toBe(1);
            expect(browser.pageExecutor.pagesClosed).toBe(1);
        } finally {
            await browser.cleanup();
            await fixture.close();
        }
    }, 60000);
});
