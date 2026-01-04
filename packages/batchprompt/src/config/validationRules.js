import { z } from 'zod';
import Ajv from 'ajv';
import Handlebars from 'handlebars';
// Safe instantiation of AJV
// @ts-ignore
const ajv = new Ajv.default ? new Ajv.default() : new Ajv();
/**
 * Validates that the input is a valid JSON Schema object.
 * Does NOT accept strings/paths.
 */
export const zJsonSchemaObject = z.record(z.string(), z.any()).superRefine((val, ctx) => {
    try {
        ajv.compile(val);
    }
    catch (e) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid JSON Schema: ${e.message}`
        });
    }
});
/**
 * Validates that a string contains valid Handlebars syntax.
 */
export const zHandlebars = z.string().superRefine((val, ctx) => {
    if (!val.includes('{{'))
        return;
    try {
        Handlebars.precompile(val);
    }
    catch (e) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid Handlebars template: ${e.message}`
        });
    }
});
//# sourceMappingURL=validationRules.js.map