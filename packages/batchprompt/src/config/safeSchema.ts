import { z } from 'zod';
import {
    GlobalsConfigSchema,
    StepConfigSchema
} from './schema.js';

// SafeStepConfigSchema is now identical to StepConfigSchema as command fields were removed
export const SafeStepConfigSchema = StepConfigSchema;

export const SafePipelineConfigSchema = GlobalsConfigSchema.extend({
    data: z.array(z.record(z.string(), z.any())).default([{}]),
    steps: z.array(SafeStepConfigSchema).min(1)
});

export type SafePipelineConfig = z.infer<typeof SafePipelineConfigSchema>;
