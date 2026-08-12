export * from './WebSearchProvider.js';
export { SerperWebSearch } from './SerperWebSearch.js';
export { DataForSeoWebSearch } from './DataForSeoWebSearch.js';

import { SerperWebSearch } from './SerperWebSearch.js';

/**
 * Backwards-compatible name for the original Serper-backed implementation.
 * New code should depend on WebSearchProvider and instantiate SerperWebSearch,
 * DataForSeoWebSearch, or PuppeteerWebSearch explicitly.
 */
export class WebSearch extends SerperWebSearch {}
