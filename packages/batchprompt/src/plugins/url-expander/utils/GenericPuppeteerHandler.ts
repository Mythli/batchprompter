import { GenericHandler } from './types.js';
import { compressHtml } from '../../../utils/compressHtml.js';
import { PuppeteerPageHelper } from '../../../utils/puppeteer/PuppeteerPageHelper.js';
import { PuppeteerHelper } from '../../../utils/puppeteer/PuppeteerHelper.js';
import PQueue from 'p-queue';

export class GenericPuppeteerHandler implements GenericHandler {
    name = 'generic-puppeteer';

    constructor(
        private puppeteerHelper: PuppeteerHelper,
        private puppeteerQueue?: PQueue
    ) {}

    async handle(url: string): Promise<string | null> {
        const task = async () => {
            const pageHelper = await this.puppeteerHelper.getPageHelper();
            try {
                // We use navigateAndCache to leverage existing caching logic if available
                const html = await pageHelper.navigateAndCache<string>(
                    url,
                    async (ph: PuppeteerPageHelper) => {
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
            } finally {
                await pageHelper.close();
            }
        };

        if (this.puppeteerQueue) {
            return this.puppeteerQueue.add(task) as Promise<string | null>;
        }

        return task();
    }
}
