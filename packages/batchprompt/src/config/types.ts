import { z } from 'zod';
import { OutputConfigSchema, ModelConfig } from './schemas/index.js';

// =============================================================================
// Base Types
// =============================================================================

export type { ModelConfig };
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
    GlobalsConfig,
    RuntimeConfig,
} from './schema.js';
