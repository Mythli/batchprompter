import { SiteHandler, GenericHandler } from './types.js';
import { GenericFetchHandler } from './GenericFetchHandler.js';
import { GenericPuppeteerHandler } from './GenericPuppeteerHandler.js';
export declare class UrlHandlerRegistry {
    private fetchFallback;
    private puppeteerFallback;
    private specificHandlers;
    constructor(fetchFallback: GenericFetchHandler, puppeteerFallback: GenericPuppeteerHandler);
    registerSpecific(handler: SiteHandler): void;
    getSpecificHandler(url: string): SiteHandler | null;
    getFallback(mode: string): GenericHandler;
}
//# sourceMappingURL=UrlHandlerRegistry.d.ts.map