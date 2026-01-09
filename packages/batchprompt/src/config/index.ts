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
    // Factory for custom plugin unions (used by CLI)
    createPipelineSchema
} from './schema.js';

// =============================================================================
// Types
// =============================================================================

export type {
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

export { zJsonSchemaObject, zHandlebars } from './validationRules.js';
export { resolveConfig, type ResolveConfigDependencies } from './resolveConfig.js';
