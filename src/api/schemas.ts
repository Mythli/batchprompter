import { z } from 'zod';

export const LeadGenRequestSchema = z.object({
    objective: z.string().describe("The goal of the lead generation, e.g. 'Find language schools in Munster'"),
    extractionSchema: z.record(z.string(), z.any()).describe("The JSON Schema defining the data to extract from each lead's website"),
    limit: z.number().int().positive().default(5).describe("Maximum number of leads to process")
});

export const LeadGenResponseSchema = z.object({
    id: z.string(),
    status: z.enum(['processing', 'completed', 'failed']),
    results: z.array(z.record(z.string(), z.any())).optional()
});
