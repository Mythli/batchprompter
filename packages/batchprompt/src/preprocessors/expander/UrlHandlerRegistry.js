export class UrlHandlerRegistry {
    fetchFallback;
    puppeteerFallback;
    specificHandlers = [];
    constructor(fetchFallback, puppeteerFallback) {
        this.fetchFallback = fetchFallback;
        this.puppeteerFallback = puppeteerFallback;
    }
    registerSpecific(handler) {
        this.specificHandlers.push(handler);
    }
    getSpecificHandler(url) {
        for (const handler of this.specificHandlers) {
            if (handler.canHandle(url)) {
                return handler;
            }
        }
        return null;
    }
    getFallback(mode) {
        if (mode === 'fetch') {
            return this.fetchFallback;
        }
        // Default to puppeteer for 'auto' or 'puppeteer'
        return this.puppeteerFallback;
    }
}
//# sourceMappingURL=UrlHandlerRegistry.js.map