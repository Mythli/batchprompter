import { z } from 'zod';
import { GlobalsConfigSchema, StepConfigSchema } from './schema.js';

/**
 * Safe schemas are identical to regular schemas.
 * Shell commands are now handled by a plugin, so there's no difference.
 * These exports are maintained for backward compatibility with ConfigRefiner.
 */
export const SafeStepConfigSchema = StepConfigSchema;

export const SafePipelineConfigSchema = GlobalsConfigSchema.extend({
    data: z.array(z.record(z.string(), z.any())).default([{}]),
    steps: z.array(SafeStepConfigSchema).min(1)
});

export type SafePipelineConfig = z.infer<typeof SafePipelineConfigSchema>;
