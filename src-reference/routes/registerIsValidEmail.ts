import { Hono, Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { VerifyEmailFunction } from '../lib/verifyEmail.js';

export interface RegisterIsValidEmailDependencies {
    app: Hono<any>;
    verifyEmail: VerifyEmailFunction;
}

// Schema for the core email validation options with sensible defaults.
const emailValidationOptionsSchema = z.object({
    checkMx: z.coerce.boolean().default(true),
    timeout: z.coerce.number().int().positive().default(5000),
});

// Schema for the email itself, used in POST body.
const emailSchema = z.object({
    email: z.string().email({ message: "Invalid email format" }),
});

// Combined schema for GET requests where all parameters are in the query.
const getRequestSchema = emailSchema.merge(emailValidationOptionsSchema);

type IsValidEmailInput = z.infer<typeof getRequestSchema>;

async function handleIsValidEmailRequest(c: Context, input: IsValidEmailInput, verifyEmail: VerifyEmailFunction) {
    const { email, ...options } = input;

    try {
        const result = await verifyEmail(email, options);
        return c.json(result);
    } catch (error: any) {
        console.error(`[${input.email}] Error validating email:`, error);
        c.status(500);
        return c.json({ error: 'Failed to validate email', details: error.message });
    }
}

export function registerIsValidEmailRoute(deps: RegisterIsValidEmailDependencies) {
    const { app, verifyEmail } = deps;

    app.get(
        '/isValidEmail',
        zValidator('query', getRequestSchema),
        async (c) => {
            const input = c.req.valid('query');
            return handleIsValidEmailRequest(c, input, verifyEmail);
        }
    );

    app.post(
        '/isValidEmail',
        zValidator('json', emailSchema),
        zValidator('query', emailValidationOptionsSchema),
        async (c) => {
            const body = c.req.valid('json');
            const query = c.req.valid('query');
            const input = { ...body, ...query };
            return handleIsValidEmailRequest(c, input, verifyEmail);
        }
    );
}
