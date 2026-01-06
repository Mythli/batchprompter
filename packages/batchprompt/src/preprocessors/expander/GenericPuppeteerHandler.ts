import { GenericHandler } from './types.js';
import { PluginServices } from '../../plugins/types.js';

export class GenericPuppeteerHandler implements GenericHandler {
    name = 'generic-puppeteer';

    canHandle(url: string): boolean {
        return true; // Fallback
    }

    async handle(url: string, services: PluginServices): Promise<string | null> {
        if (!services.puppeteerHelper) return null;
        
        try {
            const pageHelper = await services.puppeteerHelper.getPageHelper();
            const content = await pageHelper.navigateToUrlAndGetHtml(url, { htmlOnly: true });
            await pageHelper.close();
            return content;
        } catch (e) {
            return null;
        }
    }
}
