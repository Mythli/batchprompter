import { z } from 'zod';
import { OutputConfigSchema, ResolvedModelConfig } from './schemas/index.js';

// =============================================================================
// Base Types
// =============================================================================

export type { ResolvedModelConfig };
export type { OutputConfig } from './schemas/index.js';

// =============================================================================
// Resolved Plugin Base
// =============================================================================

export const ResolvedPluginBaseSchema = z.object({
    type: z.string(),
    id: z.string(),
    output: OutputConfigSchema,
    config: z.any(),
    instance: z.any() // This is the Plugin<T> instance
});

export type ResolvedPluginBase = z.infer<typeof ResolvedPluginBaseSchema>;

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
    ResolvedPipelineConfig 
} from './schema.js';
