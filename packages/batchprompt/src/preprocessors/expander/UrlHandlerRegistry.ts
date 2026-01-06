import { GenericHandler } from './types.js';
import { GenericFetchHandler } from './GenericFetchHandler.js';
import { GenericPuppeteerHandler } from './GenericPuppeteerHandler.js';
import { WikipediaHandler } from './sites/WikipediaHandler.js';

export class UrlHandlerRegistry {
    private handlers: GenericHandler[] = [];

    constructor() {
        // Register default handlers
        this.register(new WikipediaHandler());
        
        // Generic handlers (fallback)
        this.register(new GenericPuppeteerHandler());
        this.register(new GenericFetchHandler());
    }

    register(handler: GenericHandler) {
        this.handlers.push(handler);
    }

    getHandlers(): GenericHandler[] {
        return this.handlers;
    }
}
