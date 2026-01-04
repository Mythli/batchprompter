import { PluginRegistryV2 } from './types.js';
export * from './types.js';
export { WebSearchPluginV2 } from './web-search/WebSearchPluginV2.js';
export { ImageSearchPluginV2 } from './image-search/ImageSearchPluginV2.js';
export { WebsiteAgentPluginV2 } from './website-agent/WebsiteAgentPluginV2.js';
export { StyleScraperPluginV2 } from './style-scraper/StyleScraperPluginV2.js';
export { ValidationPluginV2 } from './validation/ValidationPluginV2.js';
export { DedupePluginV2 } from './dedupe/DedupePluginV2.js';
export { LogoScraperPluginV2 } from './logo-scraper/LogoScraperPluginV2.js';
/**
 * Create a plugin registry with all built-in plugins registered
 *
 * Note: UrlExpanderPluginV2 is NOT registered here because URL expansion
 * is handled by the UrlExpanderPlugin preprocessor in src/preprocessors/
 */
export declare function createPluginRegistry(): PluginRegistryV2;
//# sourceMappingURL=index.d.ts.map