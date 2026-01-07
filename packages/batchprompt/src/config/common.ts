import { z } from 'zod';

// Re-export from schemas - this is the single source of truth
export { 
    PromptSchema,
    OutputConfigSchema,
    DEFAULT_PLUGIN_OUTPUT,
    ModelConfigSchema,
    BaseModelConfigSchema,
    PluginModelConfigSchema
} from './schemas/index.js';

export type { 
    PromptDef,
    OutputConfig, 
    ModelConfig, 
    BaseModelConfig,
    PluginModelConfig 
} from './schemas/index.js';

// Backward compatibility alias
export { PromptSchema as PromptDefSchema } from './schemas/index.js';
