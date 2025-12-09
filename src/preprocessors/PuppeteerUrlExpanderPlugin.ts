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

        const task = async () => {
            const pageHelper = await context.services.puppeteerHelper!.getPageHelper();
            try {
                // We use navigateAndCache to leverage existing caching logic if available
                // However, navigateAndCache expects a return value.
                const html = await pageHelper.navigateAndCache<string>(
                    url,
                    async (ph) => {
                        const rawHtml = await ph.getFinalHtml();
                        return compressHtml(rawHtml);
                    },
                    {
                        dismissCookies: false, // No need to dismiss cookies in HTML-only mode
                        htmlOnly: true, // Enforce HTML-only mode for performance
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
        };

        if (context.services.puppeteerQueue) {
            return context.services.puppeteerQueue.add(task) as Promise<string | null>;
        }

        return task();
    }
}
