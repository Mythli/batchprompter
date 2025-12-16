import { PluginRegistryV2 } from './types.js';
import { WebSearchPluginV2 } from './web-search/WebSearchPluginV2.js';
import { ImageSearchPluginV2 } from './image-search/ImageSearchPluginV2.js';
import { WebsiteAgentPluginV2 } from './website-agent/WebsiteAgentPluginV2.js';
import { StyleScraperPluginV2 } from './style-scraper/StyleScraperPluginV2.js';
import { ValidationPluginV2 } from './validation/ValidationPluginV2.js';
import { DedupePluginV2 } from './dedupe/DedupePluginV2.js';
import { UrlExpanderPluginV2 } from './url-expander/UrlExpanderPluginV2.js';

// Re-export types
export * from './types.js';

// Re-export V2 plugin classes
export { WebSearchPluginV2 } from './web-search/WebSearchPluginV2.js';
export { ImageSearchPluginV2 } from './image-search/ImageSearchPluginV2.js';
export { WebsiteAgentPluginV2 } from './website-agent/WebsiteAgentPluginV2.js';
export { StyleScraperPluginV2 } from './style-scraper/StyleScraperPluginV2.js';
export { ValidationPluginV2 } from './validation/ValidationPluginV2.js';
export { DedupePluginV2 } from './dedupe/DedupePluginV2.js';
export { UrlExpanderPluginV2 } from './url-expander/UrlExpanderPluginV2.js';

/**
 * Create a plugin registry with all built-in V2 plugins registered
 */
export function createPluginRegistryV2(): PluginRegistryV2 {
    const registry = new PluginRegistryV2();

    registry.register(new WebSearchPluginV2());
    registry.register(new ImageSearchPluginV2());
    registry.register(new WebsiteAgentPluginV2());
    registry.register(new StyleScraperPluginV2());
    registry.register(new ValidationPluginV2());
    registry.register(new DedupePluginV2());
    registry.register(new UrlExpanderPluginV2());

    return registry;
}
