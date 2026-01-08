import { PluginRegistryV2, LlmFactory } from './types.js';
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
import { PromptLoader } from '../config/PromptLoader.js';
import { WebSearch } from './web-search/WebSearch.js';
import { ImageSearch } from './image-search/ImageSearch.js';
import { PuppeteerHelper } from '../utils/puppeteer/PuppeteerHelper.js';
import { Fetcher } from 'llm-fns';
import PQueue from 'p-queue';

// Re-export types
export * from './types.js';

// Re-export plugin classes
export { WebSearchPluginV2 } from './web-search/WebSearchPluginV2.js';
export { ImageSearchPluginV2 } from './image-search/ImageSearchPluginV2.js';
export { WebsiteAgentPluginV2 } from './website-agent/WebsiteAgentPluginV2.js';
export { StyleScraperPluginV2 } from './style-scraper/StyleScraperPluginV2.js';
export { ValidationPluginV2 } from './validation/ValidationPluginV2.js';
export { DedupePluginV2 } from './dedupe/DedupePluginV2.js';
export { LogoScraperPluginV2 } from './logo-scraper/LogoScraperPluginV2.js';
export { UrlExpanderPlugin } from './url-expander/UrlExpanderPlugin.js';

export interface PluginDependencies {
    promptLoader: PromptLoader;
    createLlm: LlmFactory;
    webSearch?: WebSearch;
    imageSearch?: ImageSearch;
    puppeteerHelper?: PuppeteerHelper;
    puppeteerQueue?: PQueue;
    fetcher?: Fetcher;
}

/**
 * Create a plugin registry with all built-in plugins registered and dependencies injected.
 */
export function createPluginRegistry(deps: PluginDependencies): PluginRegistryV2 {
    const registry = new PluginRegistryV2();

    // 1. Web Search
    registry.register(new WebSearchPluginV2({
        promptLoader: deps.promptLoader,
        webSearch: deps.webSearch,
        createLlm: deps.createLlm
    }));

    // 2. Image Search
    registry.register(new ImageSearchPluginV2({
        promptLoader: deps.promptLoader,
        imageSearch: deps.imageSearch,
        createLlm: deps.createLlm
    }));

    // 3. Website Agent
    registry.register(new WebsiteAgentPluginV2({
        promptLoader: deps.promptLoader,
        puppeteerHelper: deps.puppeteerHelper,
        puppeteerQueue: deps.puppeteerQueue,
        createLlm: deps.createLlm
    }));

    // 4. Style Scraper
    registry.register(new StyleScraperPluginV2({
        puppeteerHelper: deps.puppeteerHelper
    }));

    // 5. Logo Scraper
    registry.register(new LogoScraperPluginV2({
        promptLoader: deps.promptLoader,
        puppeteerHelper: deps.puppeteerHelper,
        fetcher: deps.fetcher,
        createLlm: deps.createLlm
    }));

    // 6. URL Expander
    // Inject dependencies into handlers
    const fetchHandler = new GenericFetchHandler(deps.fetcher);
    const puppeteerHandler = new GenericPuppeteerHandler(deps.puppeteerHelper, deps.puppeteerQueue);
    
    const urlHandlerRegistry = new UrlHandlerRegistry(fetchHandler, puppeteerHandler);
    urlHandlerRegistry.registerSpecific(new WikipediaHandler());
    
    registry.register(new UrlExpanderPlugin(urlHandlerRegistry));

    // 7. Logic Plugins (No external deps)
    registry.register(new ValidationPluginV2());
    registry.register(new DedupePluginV2());

    return registry;
}
