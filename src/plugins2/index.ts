import { PluginRegistry } from './types.js';
import { WebSearchPlugin } from './web-search/WebSearchPlugin.js';
import { ImageSearchPlugin } from './image-search/ImageSearchPlugin.js';
import { WebsiteAgentPlugin } from './website-agent/WebsiteAgentPlugin.js';
import { StyleScraperPlugin } from './style-scraper/StyleScraperPlugin.js';
import { ValidationPlugin } from './validation/ValidationPlugin.js';
import { DedupePlugin } from './dedupe/DedupePlugin.js';
import { UrlExpanderPlugin } from './url-expander/UrlExpanderPlugin.js';

export * from './types.js';

// Re-export plugin classes
export { WebSearchPlugin } from './web-search/WebSearchPlugin.js';
export { ImageSearchPlugin } from './image-search/ImageSearchPlugin.js';
export { WebsiteAgentPlugin } from './website-agent/WebsiteAgentPlugin.js';
export { StyleScraperPlugin } from './style-scraper/StyleScraperPlugin.js';
export { ValidationPlugin } from './validation/ValidationPlugin.js';
export { DedupePlugin } from './dedupe/DedupePlugin.js';
export { UrlExpanderPlugin } from './url-expander/UrlExpanderPlugin.js';

/**
 * Create a plugin registry with all built-in plugins registered
 */
export function createPluginRegistry(): PluginRegistry {
    const registry = new PluginRegistry();

    registry.register(new WebSearchPlugin());
    registry.register(new ImageSearchPlugin());
    registry.register(new WebsiteAgentPlugin());
    registry.register(new StyleScraperPlugin());
    registry.register(new ValidationPlugin());
    registry.register(new DedupePlugin());
    registry.register(new UrlExpanderPlugin());

    return registry;
}
