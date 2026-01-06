import { z } from 'zod';
import {
    GlobalsConfigSchema,
    StepConfigSchema // This is now the Strict version
} from './schema.js';

// SafeStepConfigSchema is now identical to StepConfigSchema as command fields were removed
export const SafeStepConfigSchema = StepConfigSchema;

export const SafePipelineConfigSchema = z.object({
    data: z.array(z.record(z.string(), z.any())).default([{}]),
    globals: GlobalsConfigSchema.optional().default(GlobalsConfigSchema.parse({})),
    steps: z.array(SafeStepConfigSchema).min(1)
});

export type SafePipelineConfig = z.infer<typeof SafePipelineConfigSchema>;
