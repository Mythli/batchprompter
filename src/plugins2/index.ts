// This file is deprecated. Import from '../plugins/index.js' instead.
// Re-export everything from the new location for backward compatibility.
export * from '../plugins/index.js';

// Alias the V2 registry as the default for backward compatibility
export { PluginRegistryV2 as PluginRegistry } from '../plugins/types.js';
export { createPluginRegistryV2 as createPluginRegistry } from '../plugins/index.js';
