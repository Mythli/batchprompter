import { z } from 'zod';
import { OutputConfigSchema, ResolvedModelConfig } from './schemas/index.js';

// =============================================================================
// Base Types
// =============================================================================

export type { ResolvedModelConfig };
export type { OutputConfig } from './schemas/index.js';

// =============================================================================
// Service Capabilities
// =============================================================================

export interface ServiceCapabilities {
    hasSerper: boolean;
    hasPuppeteer: boolean;
}

// =============================================================================
// Re-exports from Schema (The Source of Truth)
// =============================================================================

// These types are now inferred from the schema definitions in config/schema.ts
// to avoid manual duplication.
export type {
    StepConfig,
    ResolvedStepConfig,
    GlobalsConfig,
    RuntimeConfig,
    ResolvedPipelineConfig,
    ResolvedPluginBase
} from './schema.js';
