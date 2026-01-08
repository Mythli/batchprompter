import { SiteHandler, GenericHandler } from './types.js';

export class UrlHandlerRegistry {
    private specificHandlers: SiteHandler[] = [];

    constructor(
        private fetchFallback: GenericHandler,
        private puppeteerFallback: GenericHandler
    ) {}

    registerSpecific(handler: SiteHandler) {
        this.specificHandlers.push(handler);
    }

    getSpecificHandler(url: string): SiteHandler | null {
        for (const handler of this.specificHandlers) {
            if (handler.canHandle(url)) {
                return handler;
            }
        }
        return null;
    }

    getFallback(mode: string): GenericHandler {
        if (mode === 'fetch') {
            return this.fetchFallback;
        }
        // Default to puppeteer for 'auto' or 'puppeteer'
        return this.puppeteerFallback;
    }
}
