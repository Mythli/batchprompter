import { GenericHandler } from './types.js';
import { PluginServices } from '../../plugins/types.js';
import { compressHtml } from '../../utils/compressHtml.js';

export class GenericPuppeteerHandler implements GenericHandler {
    name = 'generic-puppeteer';

    async handle(url: string, services: PluginServices): Promise<string | null> {
        if (!services.puppeteerHelper) {
            console.warn("[GenericPuppeteerHandler] PuppeteerHelper not available.");
            return null;
        }

        const pageHelper = await services.puppeteerHelper.getPageHelper();
        try {
            // We use navigateAndCache to leverage existing caching logic if available
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
            console.warn(`[GenericPuppeteerHandler] Failed for ${url}`, e);
            return null;
        } finally {
            await pageHelper.close();
        }
    }
}
