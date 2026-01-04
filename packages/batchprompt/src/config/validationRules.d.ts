import { z } from 'zod';
/**
 * Validates that the input is a valid JSON Schema object.
 * Does NOT accept strings/paths.
 */
export declare const zJsonSchemaObject: z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodAny>, Record<string, any>, Record<string, any>>;
/**
 * Validates that a string contains valid Handlebars syntax.
 */
export declare const zHandlebars: z.ZodEffects<z.ZodString, string, string>;
//# sourceMappingURL=validationRules.d.ts.map