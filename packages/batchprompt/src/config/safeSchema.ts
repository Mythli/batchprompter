import { z } from 'zod';
import {
    DataConfigSchema,
    GlobalsConfigSchema,
    StepConfigSchema // This is now the Strict version
} from './schema.js';

// SafeStepConfigSchema is now identical to StepConfigSchema as command fields were removed
export const SafeStepConfigSchema = StepConfigSchema;

export const SafePipelineConfigSchema = z.object({
    data: DataConfigSchema.optional().default(DataConfigSchema.parse({})),
    globals: GlobalsConfigSchema.optional().default(GlobalsConfigSchema.parse({})),
    steps: z.array(SafeStepConfigSchema).min(1)
});

export type SafePipelineConfig = z.infer<typeof SafePipelineConfigSchema>;
