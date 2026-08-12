import { PluginRegistryV2, BasePluginRow, LlmFactory } from './types.js';
import { WebSearchPlugin } from './web-search/WebSearchPlugin.js';
import { ImageSearchPlugin } from './image-search/ImageSearchPlugin.js';
import { ValidationPlugin } from './validation/ValidationPlugin.js';
import { DedupePlugin } from './dedupe/DedupePlugin.js';
import { WebsiteAgentPlugin } from './website-agent/WebsiteAgentPlugin.js';
import { UrlExpanderPlugin } from './url-expander/UrlExpanderPlugin.js';
import { StyleScraperPlugin } from './style-scraper/StyleScraperPlugin.js';
import { UrlHandlerRegistry } from './url-expander/utils/UrlHandlerRegistry.js';
import { GenericFetchHandler } from './url-expander/utils/GenericFetchHandler.js';
import { GenericPuppeteerHandler } from './url-expander/utils/GenericPuppeteerHandler.js';
import { WikipediaHandler } from './url-expander/utils/sites/WikipediaHandler.js';
import {
    WebSearchProvider,
    WebSearchProviderMap
} from './web-search/WebSearchProvider.js';
import { ImageSearch } from './image-search/ImageSearch.js';
import { PuppeteerHelper } from '../utils/puppeteer/PuppeteerHelper.js';
import { Fetcher } from 'llm-fns';
import { GenericHandler } from './url-expander/utils/types.js';

// Re-export types
export * from './types.js';

// Re-export plugin classes
export { WebSearchPlugin } from './web-search/WebSearchPlugin.js';
export { WebSearchPluginRow } from './web-search/WebSearchPluginRow.js';
export { ImageSearchPlugin } from './image-search/ImageSearchPlugin.js';
export { ImageSearchPluginRow } from './image-search/ImageSearchPluginRow.js';
export { ValidationPlugin } from './validation/ValidationPlugin.js';
export { ValidationPluginRow } from './validation/ValidationPluginRow.js';
export { DedupePlugin } from './dedupe/DedupePlugin.js';
export { DedupePluginRow } from './dedupe/DedupePluginRow.js';
export { WebsiteAgentPlugin } from './website-agent/WebsiteAgentPlugin.js';
export { WebsiteAgentPluginRow } from './website-agent/WebsiteAgentPluginRow.js';
export { UrlExpanderPlugin } from './url-expander/UrlExpanderPlugin.js';
export { UrlExpanderPluginRow } from './url-expander/UrlExpanderPluginRow.js';
export { StyleScraperPlugin } from './style-scraper/StyleScraperPlugin.js';
export { StyleScraperPluginRow } from './style-scraper/StyleScraperPluginRow.js';

export interface PluginDependencies {
    createLlm: LlmFactory;
    webSearch?: WebSearchProvider;
    webSearchProviders?: WebSearchProviderMap;
    imageSearch?: ImageSearch;
    puppeteerHelper?: PuppeteerHelper;
    puppeteerQueue?: PQueue;
    fetcher?: Fetcher;
}

import PQueue from 'p-queue';

/**
 * Create a plugin registry with all built-in plugins registered and dependencies injected.
 */
export function createPluginRegistry(deps: PluginDependencies): PluginRegistryV2 {
    const registry = new PluginRegistryV2();

    const webSearchProviders: WebSearchProviderMap = {
        ...deps.webSearchProviders
    };
    if (deps.webSearch && !webSearchProviders.serper) {
        // Backwards compatibility for callers that inject the former WebSearch class.
        webSearchProviders.serper = deps.webSearch;
    }

    // 1. Web Search (Serper, DataForSEO, and/or Puppeteer)
    if (Object.keys(webSearchProviders).length > 0) {
        registry.registerFactory('webSearch', () => new WebSearchPlugin({
            webSearchProviders
        }));
    }

    if (deps.imageSearch) {
        registry.registerFactory('imageSearch', () => new ImageSearchPlugin({
            imageSearch: deps.imageSearch!
        }));
    }

    // 2. Validation (No external deps)
    registry.registerFactory('validation', () => new ValidationPlugin());

    // 3. Dedupe (No external deps)
    registry.registerFactory('dedupe', () => new DedupePlugin());

    // 5. Website Agent (Requires Puppeteer)
    if (deps.puppeteerHelper && deps.puppeteerQueue) {
        registry.registerFactory('websiteAgent', () => new WebsiteAgentPlugin({
            puppeteerHelper: deps.puppeteerHelper!,
            puppeteerQueue: deps.puppeteerQueue!
        }));
    }

    // 6. Style Scraper (Requires Puppeteer)
    if (deps.puppeteerHelper) {
        registry.registerFactory('styleScraper', () => new StyleScraperPlugin({
            puppeteerHelper: deps.puppeteerHelper!
        }));
    }

    // 8. URL Expander (Requires Fetcher for basic functionality)
    if (deps.fetcher) {
        registry.registerFactory('urlExpander', () => {
            const fetchHandler = new GenericFetchHandler(deps.fetcher!);

            const pHandler = deps.puppeteerHelper
                ? new GenericPuppeteerHandler(deps.puppeteerHelper, deps.puppeteerQueue)
                : { name: 'puppeteer-disabled', handle: async () => null } as GenericHandler;

            const urlHandlerRegistry = new UrlHandlerRegistry(fetchHandler, pHandler);
            urlHandlerRegistry.registerSpecific(new WikipediaHandler());

            return new UrlExpanderPlugin(urlHandlerRegistry);
        });
    }

    return registry;
}
