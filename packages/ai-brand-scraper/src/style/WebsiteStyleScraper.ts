import { InteractiveElementScreenshoter, InteractiveElementsResult, ScreenshoterOptions } from './InteractiveElementScreenshoter.js';
import type { PageActionExecutor } from '../types.js';

export interface WebsiteStyleScrapeInput extends ScreenshoterOptions {
    url: string;
}

export interface WebsiteStyleScraperDeps {
    pageExecutor: PageActionExecutor;
    defaultOptions?: ScreenshoterOptions;
}

export class WebsiteStyleScraper {
    private readonly pageExecutor: PageActionExecutor;
    private readonly defaultOptions: ScreenshoterOptions;

    constructor(deps: WebsiteStyleScraperDeps) {
        this.pageExecutor = deps.pageExecutor;
        this.defaultOptions = deps.defaultOptions ?? {};
    }

    async scrape(input: WebsiteStyleScrapeInput): Promise<InteractiveElementsResult> {
        const { url, ...options } = input;
        const screenshoter = new InteractiveElementScreenshoter(this.pageExecutor);
        return screenshoter.screenshot(url, {
            ...this.defaultOptions,
            ...options,
        });
    }
}
