# ai-brand-scraper

Extract useful brand signals from a website with your own browser runtime and your own LLM client.

`ai-brand-scraper` gives you two focused capabilities:

- brand assets: favicons, logo candidates, inline SVG logos, CSS background logos, PNG-converted logo images, brand colors, and logo quality scores
- website style: screenshots and computed CSS for real buttons, inputs, and links in normal, hover, and focus states

The package is intentionally adapter-friendly. It does not import BatchPrompt internals, does not own your browser pool, and does not force a concrete LLM SDK. You pass a tiny `executeOnPage(...)` primitive plus an LLM object that can return text and Zod-validated JSON.

## Install

```sh
npm install ai-brand-scraper
```

If you want to use the Puppeteer examples below:

```sh
npm install ai-brand-scraper puppeteer
```

Node 20 or newer is recommended because the package defaults to `globalThis.fetch`.

## Quick Start

```ts
import { AiBrandScraper } from 'ai-brand-scraper';

const scraper = new AiBrandScraper({
  pageExecutor,
  analyzeLlm,
});

const assets = await scraper.scrapeBrandAssets({
  url: 'https://example.com',
  maxLogosToAnalyze: 10,
});

const style = await scraper.scrapeWebsiteStyle({
  url: 'https://example.com',
  maxButtons: 3,
  maxInputs: 3,
  maxLinks: 3,
});

console.log(assets.primaryColor);
console.log(assets.logos[0]?.base64PngData);
console.log(style.compositeImageBase64);
```

## Demo: Download Assets

Set `OPENAI_API_KEY`, then run the package demo with a website and output folder:

```sh
pnpm demo https://example.com --out ./assets/example
```

The demo saves every logo candidate that meets the score threshold as PNG files, plus `manifest.json` and `brand-colors.json`.

```sh
pnpm demo example.com \
  --out ./brand-assets/example \
  --max-logos 12 \
  --threshold 1 \
  --model gpt-4.1-mini
```

Options:

- `--out <dir>`: output folder, defaulting to `./brand-assets/<hostname>`
- `--max-logos <n>`: maximum logo candidates to analyze, defaulting to `10`
- `--threshold <n>`: minimum brand-logo score to save, defaulting to `1`
- `--model <model>`: OpenAI model, defaulting to `gpt-4.1-mini`
- `--api-key <key>` and `--base-url <url>`: override `OPENAI_API_KEY` and `OPENAI_BASE_URL`

## Public API

Class-first usage is the stable API:

```ts
import {
  AiBrandScraper,
  BrandAssetScraper,
  ImageDownloader,
  WebsiteStyleScraper,
} from 'ai-brand-scraper';

new BrandAssetScraper(deps).scrape({ url });
new WebsiteStyleScraper(deps).scrape({ url });

const scraper = new AiBrandScraper(deps);
await scraper.scrapeBrandAssets({ url });
await scraper.scrapeWebsiteStyle({ url });

new ImageDownloader({ fetcher });
```

There are no `createX` factory exports and no one-shot helper exports. Construct the classes directly.

## Dependencies You Provide

### LLM

Brand asset scraping needs an LLM that can produce plain text and Zod-validated structured output.

```ts
import type { AiBrandLlm, AiBrandMessage, AiBrandPromptTextOptions } from 'ai-brand-scraper';
import type { z } from 'zod';

const analyzeLlm: AiBrandLlm = {
  async promptZod<TSchema extends z.ZodTypeAny>(
    messages: AiBrandMessage[],
    schema: TSchema,
  ): Promise<z.infer<TSchema>> {
    const rawJson = await callYourModelForJson({ messages });
    return schema.parse(JSON.parse(rawJson));
  },

  async promptText(options: AiBrandPromptTextOptions): Promise<string> {
    return callYourModelForText(options);
  },
};
```

If you do not pass `extractLlm`, logo URL extraction uses `analyzeLlm`.

```ts
const scraper = new BrandAssetScraper({
  pageExecutor,
  analyzeLlm,
  // extractLlm is optional
});
```

### Works Well With `llm-fns`

`ai-brand-scraper` is intentionally shaped to fit [`llm-fns`](https://www.npmjs.com/package/llm-fns). It does not depend on `llm-fns`, but `llm-fns` already has the two capabilities this package needs: `promptText(...)` and `promptZod(...)`.

Raw `llm-fns` clients can be passed directly. No adapter is needed.

```ts
import OpenAI from 'openai';
import { createLlm } from 'llm-fns';
import { AiBrandScraper } from 'ai-brand-scraper';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const analyzeLlm = createLlm({
  openai,
  defaultModel: 'gpt-4.1-mini',
});

const scraper = new AiBrandScraper({
  pageExecutor,
  analyzeLlm,
});
```

BatchPrompt keeps its own bound-message API and adapts it at the logo-scraper boundary. Standalone `ai-brand-scraper` users who use raw `llm-fns` clients can pass them directly.

### Page Executor

The only browser primitive the package needs is `executeOnPage(...)`.

```ts
import type { PageActionExecutor } from 'ai-brand-scraper';

const pageExecutor: PageActionExecutor = {
  async executeOnPage({ url, cacheKey, ttl, navigation, beforeNavigate, action }) {
    // Your app owns browser/page creation, navigation, cache lookup, and close.
    // The scraper owns the page reads and extraction work inside action(page).
    return runInYourBrowserRuntime({
      url,
      cacheKey,
      ttl,
      navigation,
      beforeNavigate,
      action,
    });
  },
};
```

That boundary matters:

- the executor owns page lifecycle and should close pages
- the executor may implement caching with `cacheKey` and `ttl`
- the scraper never receives your app's helper classes
- the scraper performs live-page reads inside `action(page)`, so cache hits can return captured data without touching a closed or blank page

## Puppeteer Example

This is a minimal executor for standalone scripts. Production systems usually keep a browser pool and a real cache outside the package.

```ts
import puppeteer from 'puppeteer';
import type { PageActionExecutor } from 'ai-brand-scraper';

const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();

export const pageExecutor: PageActionExecutor = {
  async executeOnPage({ url, cacheKey, ttl, navigation, beforeNavigate, action }) {
    if (cacheKey) {
      const cached = memoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value as Awaited<ReturnType<typeof action>>;
      }
    }

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
      if (navigation?.resolution) {
        await page.setViewport(navigation.resolution);
      }

      await beforeNavigate?.(page);

      await page.goto(url, {
        waitUntil: navigation?.htmlOnly ? 'domcontentloaded' : 'networkidle0',
      });

      const value = await action(page);

      if (cacheKey && ttl) {
        memoryCache.set(cacheKey, {
          expiresAt: Date.now() + ttl,
          value,
        });
      }

      return value;
    } finally {
      await page.close();
      await browser.close();
    }
  },
};
```

## Existing Page Helpers

If you already have a page helper with navigation and cache support, adapt it structurally:

```ts
import type { PageActionExecutor } from 'ai-brand-scraper';

const pageExecutor: PageActionExecutor = {
  async executeOnPage({ url, cacheKey, ttl, navigation, beforeNavigate, action }) {
    const pageHelper = await puppeteerHelper.getPageHelper();

    return pageHelper.navigateAndCache(
      url,
      async helper => action(helper.getPage()),
      {
        ...navigation,
        cacheKey,
        ttl,
        closePage: true,
        beforeNavigate: beforeNavigate
          ? async helper => beforeNavigate(helper.getPage())
          : undefined,
      },
    );
  },
};
```

## Brand Assets

```ts
import { BrandAssetScraper } from 'ai-brand-scraper';

const scraper = new BrandAssetScraper({
  pageExecutor,
  analyzeLlm,
  fetcher: globalThis.fetch,
  defaultOptions: {
    maxLogosToAnalyze: 10,
    brandLogoScoreThreshold: 5,
  },
});

scraper.events.on('logo:found', event => {
  console.log(event.count, event.urls);
});

scraper.events.on('logo:downloaded', event => {
  console.log(event.index, event.originalUrl);
});

scraper.events.on('analysis:complete', result => {
  console.log(result.brandColors);
});

const result = await scraper.scrape({
  url: 'https://example.com',
  maxLogosToAnalyze: 6,
});
```

Result shape:

```ts
interface LogoScraperResult {
  primaryColor?: {
    hex: string;
    isDark: boolean;
    contrastColor: string;
  };
  brandColors: BrandColor[];
  logos: Array<{
    originalUrl: string;
    base64PngData: string;
    originalFileType: string | undefined;
    outputMimeType: 'image/png';
    width: number | undefined;
    height: number | undefined;
    outputPngFileSize: number;
    isFavicon: boolean;
    brandLogoScore: number;
    duplicateOfIndex: number | null;
    originalIndex: number;
    darkBackgroundPerformance?: number;
    lightBackgroundPerformance?: number;
  }>;
}
```

Defaults:

- `maxLogosToAnalyze`: `10`
- `brandLogoScoreThreshold`: `5`
- `extractLlm`: defaults to `analyzeLlm`
- `fetcher`: defaults to `globalThis.fetch`
- `imageDownloader`: defaults to `new ImageDownloader({ fetcher })`

## Website Style

```ts
import { WebsiteStyleScraper } from 'ai-brand-scraper';

const scraper = new WebsiteStyleScraper({
  pageExecutor,
  defaultOptions: {
    maxButtons: 3,
    maxInputs: 3,
    maxLinks: 3,
    createCompositeImage: true,
  },
});

const result = await scraper.scrape({
  url: 'https://example.com',
  scopeSelector: 'main',
});
```

Result shape:

```ts
interface InteractiveElementsResult {
  screenshots: Array<{
    type: 'button' | 'input' | 'link';
    state: 'normal' | 'hover' | 'focus';
    screenshotBase64: string;
    elementIndex: number;
    styles: string;
  }>;
  compositeImageBase64?: string;
}
```

Options:

- `maxButtons`: default `3`
- `maxInputs`: default `3`
- `maxLinks`: default `3`
- `createCompositeImage`: default `true`
- `seed`: default `12345`
- `scopeSelector`: optional selector to limit element discovery

## Image Downloader

`ImageDownloader` downloads image URLs or accepts image data URIs, converts the result to PNG with `sharp`, trims whitespace, and caps output dimensions.

```ts
import { ImageDownloader } from 'ai-brand-scraper';

const downloader = new ImageDownloader({
  fetcher: globalThis.fetch,
});

const logo = await downloader.downloadAndProcess('https://example.com/logo.svg');
console.log(logo.base64PngData);
```

## Exports

Primary exports:

- `AiBrandScraper`
- `BrandAssetScraper`
- `WebsiteStyleScraper`
- `ImageDownloader`

Useful types:

- `AiBrandLlm`
- `AiBrandMessage`
- `AiBrandPromptTextOptions`
- `PageActionExecutor`
- `PageActionRequest`
- `AiBrandPageLike`
- `BrandAssetScrapeInput`
- `BrandAssetScraperDeps`
- `LogoScraperResult`
- `WebsiteStyleScrapeInput`
- `WebsiteStyleScraperDeps`
- `InteractiveElementsResult`

Advanced exports:

- `CssParser`
- `InteractiveElementScreenshoter`
- `compressHtml`
- `htmlToMarkdown`

## Design Notes

`ai-brand-scraper` is meant to live at an integration boundary:

- Your app owns browser pools, navigation policy, cookies, proxying, retries, and cache.
- Your app owns LLM credentials, model choice, rate limits, and structured-output strategy.
- This package owns website brand extraction, CSS capture, screenshot capture, logo image normalization, and style screenshot composition.

That keeps it usable inside larger systems without coupling those systems to a specific browser helper class or BatchPrompt-specific dependency graph.

## Development

```sh
pnpm --filter ai-brand-scraper build
pnpm --filter ai-brand-scraper test
```

The test suite includes a browser contract test that starts a local fixture server, uses real Puppeteer, captures real CSS/screenshots, and mocks only the LLM responses.

## License

MIT
