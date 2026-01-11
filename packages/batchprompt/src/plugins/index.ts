import { PluginRegistryV2, BasePluginRow, LegacyPluginRow } from './types.js';
import { WebSearchPluginV2 } from './web-search/WebSearchPluginV2.js';
import { ImageSearchPluginV2 } from './image-search/ImageSearchPluginV2.js';
import { WebsiteAgentPluginV2 } from './website-agent/WebsiteAgentPluginV2.js';
import { StyleScraperPluginV2 } from './style-scraper/StyleScraperPluginV2.js';
import { ValidationPluginV2 } from './validation/ValidationPluginV2.js';
import { DedupePluginV2 } from './dedupe/DedupePluginV2.js';
import { LogoScraperPluginV2 } from './logo-scraper/LogoScraperPluginV2.js';
import { UrlExpanderPlugin } from './url-expander/UrlExpanderPlugin.js';
import { UrlHandlerRegistry } from './url-expander/utils/UrlHandlerRegistry.js';
import { GenericFetchHandler } from './url-expander/utils/GenericFetchHandler.js';
import { GenericPuppeteerHandler } from './url-expander/utils/GenericPuppeteerHandler.js';
import { WikipediaHandler } from './url-expander/utils/sites/WikipediaHandler.js';
import { WebSearch } from './web-search/WebSearch.js';
import { ImageSearch } from './image-search/ImageSearch.js';
import { PuppeteerHelper } from '../utils/puppeteer/PuppeteerHelper.js';
import { Fetcher } from 'llm-fns';
import { GenericHandler } from './url-expander/utils/types.js';

// Re-export types
export * from './types.js';

// Re-export plugin classes
export { WebSearchPluginV2 } from './web-search/WebSearchPluginV2.js';
export { WebSearchPluginRow } from './web-search/WebSearchPluginRow.js';
export { ImageSearchPluginV2 } from './image-search/ImageSearchPluginV2.js';
export { WebsiteAgentPluginV2 } from './website-agent/WebsiteAgentPluginV2.js';
export { StyleScraperPluginV2 } from './style-scraper/StyleScraperPluginV2.js';
export { ValidationPluginV2 } from './validation/ValidationPluginV2.js';
export { DedupePluginV2 } from './dedupe/DedupePluginV2.js';
export { LogoScraperPluginV2 } from './logo-scraper/LogoScraperPluginV2.js';
export { UrlExpanderPlugin } from './url-expander/UrlExpanderPlugin.js';

export interface PluginDependencies {
    createLlm: LlmFactory;
    webSearch?: WebSearch;
    imageSearch?: ImageSearch;
    puppeteerHelper?: PuppeteerHelper;
    puppeteerQueue?: PQueue;
    fetcher?: Fetcher;
}

import PQueue from 'p-queue';
import { LlmFactory } from './types.js';

/**
 * Create a plugin registry with all built-in plugins registered and dependencies injected.
 */
export function createPluginRegistry(deps: PluginDependencies): PluginRegistryV2 {
    const registry = new PluginRegistryV2();

    // 1. Web Search (Requires Serper)
    if (deps.webSearch) {
        registry.register(new WebSearchPluginV2({
            webSearch: deps.webSearch
        }));
    }

    // 2. Image Search (Requires Serper)
    if (deps.imageSearch) {
        registry.register(new ImageSearchPluginV2({
            imageSearch: deps.imageSearch,
            createLlm: deps.createLlm
        }));
    }

    // 3. Website Agent (Requires Puppeteer)
    if (deps.puppeteerHelper && deps.puppeteerQueue) {
        registry.register(new WebsiteAgentPluginV2({
            puppeteerHelper: deps.puppeteerHelper,
            puppeteerQueue: deps.puppeteerQueue,
            createLlm: deps.createLlm
        }));
    }

    // 4. Style Scraper (Requires Puppeteer)
    if (deps.puppeteerHelper) {
        registry.register(new StyleScraperPluginV2({
            puppeteerHelper: deps.puppeteerHelper
        }));
    }

    // 5. Logo Scraper (Requires Puppeteer + Fetcher)
    if (deps.puppeteerHelper && deps.fetcher) {
        registry.register(new LogoScraperPluginV2({
            puppeteerHelper: deps.puppeteerHelper,
            fetcher: deps.fetcher,
            createLlm: deps.createLlm
        }));
    }

    // 6. URL Expander (Requires Fetcher for basic functionality)
    if (deps.fetcher) {
        const fetchHandler = new GenericFetchHandler(deps.fetcher);
        
        const pHandler = deps.puppeteerHelper 
            ? new GenericPuppeteerHandler(deps.puppeteerHelper, deps.puppeteerQueue)
            : { name: 'puppeteer-disabled', handle: async () => null } as GenericHandler;

        const urlHandlerRegistry = new UrlHandlerRegistry(fetchHandler, pHandler);
        urlHandlerRegistry.registerSpecific(new WikipediaHandler());
        
        registry.register(new UrlExpanderPlugin(urlHandlerRegistry));
    }

    // 7. Logic Plugins (No external deps)
    registry.register(new ValidationPluginV2());
    registry.register(new DedupePluginV2());

    return registry;
}
