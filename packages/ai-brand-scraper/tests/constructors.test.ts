import { describe, expect, it } from 'vitest';
import {
    AiBrandScraper,
    BrandAssetScraper,
    ImageDownloader,
} from '../src/index.js';
import {
    brandCaptureExecutor,
    ConstructorLlm,
    styleExecutor,
} from './setup/constructors.js';

describe('class-first public API', () => {
    it('defaults extractLlm to analyzeLlm and creates a default image downloader', async () => {
        const llm = new ConstructorLlm();
        const scraper = new BrandAssetScraper({
            pageExecutor: brandCaptureExecutor,
            analyzeLlm: llm,
        });

        expect(new ImageDownloader()).toBeInstanceOf(ImageDownloader);

        const result = await scraper.scrape({ url: 'https://example.test' });

        expect(result.brandColors[0]?.hex).toBe('#0b5fff');
        expect(llm.extractionPrompts).toBe(1);
        expect(llm.colorPrompts).toBe(1);
    });

    it('composes brand and style scrapers through AiBrandScraper', async () => {
        const llm = new ConstructorLlm();
        const scraper = new AiBrandScraper({
            pageExecutor: brandCaptureExecutor,
            analyzeLlm: llm,
            stylePageExecutor: styleExecutor,
        });

        expect(scraper).toBeInstanceOf(AiBrandScraper);

        const assets = await scraper.scrapeBrandAssets({
            url: 'https://example.test',
        });
        const style = await scraper.scrapeWebsiteStyle({
            url: 'https://example.test',
        });

        expect(assets.brandColors[0]?.hex).toBe('#0b5fff');
        expect(style.screenshots).toEqual([]);
    });
});
