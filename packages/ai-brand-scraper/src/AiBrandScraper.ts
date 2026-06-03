import { BrandAssetScraper } from './logo/BrandAssetScraper.js';
import { WebsiteStyleScraper } from './style/WebsiteStyleScraper.js';
import type { BrandAssetScraperDeps, BrandAssetScrapeInput, LogoScraperResult } from './logo/BrandAssetScraper.js';
import type { WebsiteStyleScrapeInput } from './style/WebsiteStyleScraper.js';
import type { InteractiveElementsResult, ScreenshoterOptions } from './style/InteractiveElementScreenshoter.js';
import type { PageActionExecutor } from './types.js';

export interface AiBrandScraperDeps extends BrandAssetScraperDeps {
    stylePageExecutor?: PageActionExecutor;
    styleDefaultOptions?: ScreenshoterOptions;
}

export class AiBrandScraper {
    public readonly brandAssetScraper: BrandAssetScraper;
    public readonly websiteStyleScraper: WebsiteStyleScraper;
    public readonly events: BrandAssetScraper['events'];

    constructor(deps: AiBrandScraperDeps) {
        this.brandAssetScraper = new BrandAssetScraper(deps);
        this.websiteStyleScraper = new WebsiteStyleScraper({
            pageExecutor: deps.stylePageExecutor ?? deps.pageExecutor,
            defaultOptions: deps.styleDefaultOptions,
        });
        this.events = this.brandAssetScraper.events;
    }

    scrapeBrandAssets(input: BrandAssetScrapeInput): Promise<LogoScraperResult> {
        return this.brandAssetScraper.scrape(input);
    }

    scrapeWebsiteStyle(input: WebsiteStyleScrapeInput): Promise<InteractiveElementsResult> {
        return this.websiteStyleScraper.scrape(input);
    }
}
