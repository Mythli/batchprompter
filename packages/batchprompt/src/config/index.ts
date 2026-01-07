// =============================================================================
// Schemas - Single Source of Truth
// =============================================================================

export {
    // Prompt
    PromptSchema,
    type PromptDef,
    
    // Output
    OutputConfigSchema,
    DEFAULT_PLUGIN_OUTPUT,
    type OutputConfig,
    
    // Model
    ModelConfigSchema,
    BaseModelConfigSchema,
    PluginModelConfigSchema,
    type ModelConfig,
    type BaseModelConfig,
    type PluginModelConfig
} from './schemas/index.js';

// =============================================================================
// Pipeline Schemas
// =============================================================================

export {
    // Backward compatibility alias
    PromptDefSchema,
    
    // Step
    FeedbackConfigSchema,
    LooseStepConfigSchema,
    StepConfigSchema,
    
    // Globals
    GlobalsConfigSchema,
    
    // Pipeline
    LoosePipelineConfigSchema,
    PipelineConfigSchema,
    
    // Factory for custom plugin unions (used by CLI)
    createPipelineSchema
} from './schema.js';

// =============================================================================
// Types
// =============================================================================

export type {
    ResolvedOutputConfig,
    ResolvedModelConfig,
    ResolvedPluginBase,
    ServiceCapabilities,
    StepConfig,
    ResolvedStepConfig,
    GlobalsConfig,
    RuntimeConfig,
    ResolvedPipelineConfig
} from './types.js';

// =============================================================================
// Loaders & Utilities
// =============================================================================

export { PromptLoader } from './PromptLoader.js';
export type { SchemaLoader } from './SchemaLoader.js';
export { zJsonSchemaObject, zHandlebars } from './validationRules.js';
export { ConfigNormalizer } from './ConfigNormalizer.js';
export { resolveConfig, type ResolveConfigDependencies } from './resolveConfig.js';
