import OpenAI from 'openai';
import { z } from 'zod';
import {
    OutputConfigSchema,
    ResolvedModelConfig,
    RawModelConfigSchema
} from './schemas/index.js';
import { GlobalsConfigSchema, StepConfigSchema } from './schema.js';

// =============================================================================
// Schema-Derived Types
// =============================================================================

export type OutputConfig = z.infer<typeof OutputConfigSchema>;
export type ModelConfig = z.infer<typeof RawModelConfigSchema>;
export type BaseModelConfig = ModelConfig;
export type ResolvedOutputConfig = OutputConfig;

// =============================================================================
// Prompt Types
// =============================================================================

export type PromptDef = string | any[];

// =============================================================================
// Service Configuration
// =============================================================================

export interface ServiceCapabilities {
    hasSerper: boolean;
    hasPuppeteer: boolean;
}

// =============================================================================
// Resolved Types (Runtime)
// =============================================================================

export { ResolvedModelConfig };

export interface ResolvedPluginBase {
    type: string;
    id: string;
    output: OutputConfig;
    rawConfig?: any;
}

// =============================================================================
// Step Configuration (Runtime)
// =============================================================================

// Base type from Zod schema
type StepConfigBase = z.infer<typeof StepConfigSchema>;

export interface StepConfig extends Omit<StepConfigBase, 'plugins' | 'model' | 'judge' | 'feedback'> {
    // Resolved Plugins
    plugins: ResolvedPluginBase[];

    // Resolved Models
    model: ResolvedModelConfig;
    judge?: ResolvedModelConfig;
    feedback?: ResolvedModelConfig & { loops: number };

    // Runtime paths
    resolvedOutputDir?: string;
    resolvedTempDir?: string;
    outputBasename?: string;
    outputExtension?: string;
    outputTemplate?: string;
    tmpDir?: string;
}

export type ResolvedStepConfig = StepConfig;

// =============================================================================
// Global & Pipeline Configuration (Runtime)
// =============================================================================

type GlobalsConfigBase = z.infer<typeof GlobalsConfigSchema>;

export interface GlobalsConfig extends GlobalsConfigBase {}

export interface RuntimeConfig extends GlobalsConfig {
    steps: StepConfig[];
    data: Record<string, any>[];
}

export type ResolvedPipelineConfig = RuntimeConfig;
