import { PluginRegistryV2, BasePluginRow, LlmFactory } from './types.js';
import { WebSearchPlugin } from './web-search/WebSearchPlugin.js';
import { ValidationPlugin } from './validation/ValidationPlugin.js';
import { DedupePlugin } from './dedupe/DedupePlugin.js';
// import { ImageSearchPluginV2 } from './image-search/ImageSearchPluginV2.js';
import { WebsiteAgentPlugin } from './website-agent/WebsiteAgentPlugin.js';
// import { StyleScraperPluginV2 } from './style-scraper/StyleScraperPluginV2.js';
// import { LogoScraperPluginV2 } from './logo-scraper/LogoScraperPluginV2.js';
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
export { WebSearchPlugin } from './web-search/WebSearchPlugin.js';
export { WebSearchPluginRow } from './web-search/WebSearchPluginRow.js';
export { ValidationPlugin } from './validation/ValidationPlugin.js';
export { ValidationPluginRow } from './validation/ValidationPluginRow.js';
export { DedupePlugin } from './dedupe/DedupePlugin.js';
export { DedupePluginRow } from './dedupe/DedupePluginRow.js';
// export { ImageSearchPluginV2 } from './image-search/ImageSearchPluginV2.js';
export { WebsiteAgentPlugin } from './website-agent/WebsiteAgentPlugin.js';
export { WebsiteAgentPluginRow } from './website-agent/WebsiteAgentPluginRow.js';
// export { StyleScraperPluginV2 } from './style-scraper/StyleScraperPluginV2.js';
// export { LogoScraperPluginV2 } from './logo-scraper/LogoScraperPluginV2.js';
export { UrlExpanderPlugin } from './url-expander/UrlExpanderPlugin.js';
export { UrlExpanderPluginRow } from './url-expander/UrlExpanderPluginRow.js';

export interface PluginDependencies {
    createLlm: LlmFactory;
    webSearch?: WebSearch;
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

    // 1. Web Search (Requires Serper)
    if (deps.webSearch) {
        registry.register(new WebSearchPlugin({
            webSearch: deps.webSearch
        }));
    }

    // 2. Validation (No external deps)
    registry.register(new ValidationPlugin());

    // 3. Dedupe (No external deps)
    registry.register(new DedupePlugin());

    // 4. Image Search (Requires Serper)
    // Note: ImageSearchPluginV2 needs migration to new architecture
    // if (deps.imageSearch) {
    //     registry.register(new ImageSearchPluginV2({
    //         imageSearch: deps.imageSearch,
    //         createLlm: deps.createLlm
    //     }));
    // }

    // 5. Website Agent (Requires Puppeteer)
    if (deps.puppeteerHelper && deps.puppeteerQueue) {
        registry.register(new WebsiteAgentPlugin({
            puppeteerHelper: deps.puppeteerHelper,
            puppeteerQueue: deps.puppeteerQueue
        }));
    }

    // 6. Style Scraper (Requires Puppeteer)
    // Note: StyleScraperPluginV2 needs migration to new architecture
    // if (deps.puppeteerHelper) {
    //     registry.register(new StyleScraperPluginV2({
    //         puppeteerHelper: deps.puppeteerHelper
    //     }));
    // }

    // 7. Logo Scraper (Requires Puppeteer + Fetcher)
    // Note: LogoScraperPluginV2 needs migration to new architecture
    // if (deps.puppeteerHelper && deps.fetcher) {
    //     registry.register(new LogoScraperPluginV2({
    //         puppeteerHelper: deps.puppeteerHelper,
    //         fetcher: deps.fetcher,
    //         createLlm: deps.createLlm
    //     }));
    // }

    // 8. URL Expander (Requires Fetcher for basic functionality)
    if (deps.fetcher) {
        const fetchHandler = new GenericFetchHandler(deps.fetcher);

        const pHandler = deps.puppeteerHelper
            ? new GenericPuppeteerHandler(deps.puppeteerHelper, deps.puppeteerQueue)
            : { name: 'puppeteer-disabled', handle: async () => null } as GenericHandler;

        const urlHandlerRegistry = new UrlHandlerRegistry(fetchHandler, pHandler);
        urlHandlerRegistry.registerSpecific(new WikipediaHandler());

        registry.register(new UrlExpanderPlugin(urlHandlerRegistry));
    }

    return registry;
}
