import OpenAI from 'openai';
import { z } from 'zod';
import {
    OutputConfigSchema,
    ResolvedModelConfig,
    RawModelConfigSchema,
    PromptSchema
} from './schemas/index.js';
import { GlobalsConfigSchema, StepBaseSchema } from './schema.js';

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

export type PromptDef = z.infer<typeof PromptSchema>;

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

const ResolvedPluginBaseSchema = z.object({
    type: z.string(),
    id: z.string(),
    output: OutputConfigSchema,
    config: z.any(),
    instance: z.any()
});

export type ResolvedPluginBase = z.infer<typeof ResolvedPluginBaseSchema>;

// =============================================================================
// Step Configuration (Runtime)
// =============================================================================

const ResolvedStepConfigSchema = StepBaseSchema
    .omit({ model: true, judge: true, feedback: true })
    .extend({
        // Resolved Plugins
        plugins: z.array(ResolvedPluginBaseSchema),

        // Resolved Models
        model: z.custom<ResolvedModelConfig>(),
        judge: z.custom<ResolvedModelConfig>().optional(),
        feedback: z.custom<ResolvedModelConfig & { loops: number }>().optional(),

        // Runtime paths
        resolvedOutputDir: z.string().optional(),
        resolvedTempDir: z.string().optional(),
        outputBasename: z.string().optional(),
        outputExtension: z.string().optional(),
        outputTemplate: z.string().optional(),
        tmpDir: z.string().optional(),
    });

export type StepConfig = z.infer<typeof ResolvedStepConfigSchema>;
export type ResolvedStepConfig = StepConfig;

// =============================================================================
// Global & Pipeline Configuration (Runtime)
// =============================================================================

export type GlobalsConfig = z.infer<typeof GlobalsConfigSchema>;

export type RuntimeConfig = GlobalsConfig & {
    steps: StepConfig[];
    data: Record<string, any>[];
};

export type ResolvedPipelineConfig = RuntimeConfig;
