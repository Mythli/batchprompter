import { UrlExpanderBase } from './UrlExpanderBase.js';
import { PreprocessorContext } from './types.js';
import { compressHtml } from '../utils/compressHtml.js';

export class PuppeteerUrlExpanderPlugin extends UrlExpanderBase {
    name = 'puppeteer-url-expander';
    flagName = 'expand-urls-puppeteer';

    async fetchContent(url: string, context: PreprocessorContext): Promise<string | null> {
        if (!context.services.puppeteerHelper) {
            console.warn("PuppeteerHelper not available for expansion.");
            return null;
        }

        // We use navigateAndCache to leverage existing caching logic if available
        // However, navigateAndCache expects a return value.
        
        const pageHelper = await context.services.puppeteerHelper.getPageHelper();
        try {
            // We use navigateAndCache to ensure we don't re-scrape the same URL multiple times in a run
            // if the cache is enabled globally.
            const html = await pageHelper.navigateAndCache<string>(
                url,
                async (ph) => {
                    const rawHtml = await ph.getFinalHtml();
                    return compressHtml(rawHtml);
                },
                {
                    dismissCookies: true,
                    htmlOnly: true,
                    ttl: 24 * 60 * 60 * 1000 // 24 hours
                }
            );
            return html;
        } catch (e) {
            console.warn(`Puppeteer expansion failed for ${url}`, e);
            return null;
        } finally {
            await pageHelper.close();
        }
    }
}
