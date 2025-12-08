import { GenericHandler } from './types.js';
import { PluginServices } from '../../plugins/types.js';
import { compressHtml } from '../../utils/compressHtml.js';

export class GenericPuppeteerHandler implements GenericHandler {
    name = 'generic-puppeteer';

    async handle(url: string, services: PluginServices): Promise<string | null> {
        if (!services.puppeteerHelper) {
            throw new Error("[GenericPuppeteerHandler] PuppeteerHelper not available.");
        }

        const task = async () => {
            const pageHelper = await services.puppeteerHelper!.getPageHelper();
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
            } finally {
                await pageHelper.close();
            }
        };

        if (services.puppeteerQueue) {
            return services.puppeteerQueue.add(task) as Promise<string | null>;
        }

        return task();
    }
}
