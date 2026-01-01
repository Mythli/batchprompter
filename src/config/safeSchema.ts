import { z } from 'zod';
import {
    DataConfigSchema,
    GlobalsConfigSchema,
    StepConfigSchema
} from './schema.js';

// Omit command execution fields for safety
export const SafeStepConfigSchema = StepConfigSchema.omit({
    command: true,
    verifyCommand: true,
    skipCandidateCommand: true
});

export const SafePipelineConfigSchema = z.object({
    data: DataConfigSchema.optional().default(DataConfigSchema.parse({})),
    globals: GlobalsConfigSchema.optional().default(GlobalsConfigSchema.parse({})),
    steps: z.array(SafeStepConfigSchema).min(1)
});

export type SafePipelineConfig = z.infer<typeof SafePipelineConfigSchema>;
