import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { IsCustomDomain } from '../lib/isCustomDomain.js';

type Dependencies = {
    app: Hono;
    isCustomDomain: IsCustomDomain;
};

const schema = z.object({
    email: z.string().email("Please provide a valid email address."),
});

export const registerIsCustomDomainRoute = ({ app, isCustomDomain }: Dependencies) => {
    app.get(
        '/is-custom-domain',
        zValidator('query', schema, (result, c) => {
            if (!result.success) {
                return c.json({ error: 'Validation failed', issues: result.error.issues }, 400);
            }
        }),
        async (c) => {
            const { email } = c.req.valid('query');

            try {
                const result = await isCustomDomain.check(email);
                return c.json(result);
            } catch (error: any) {
                console.error(`[IsCustomDomainRoute] Error checking domain for ${email}:`, error);
                return c.json({ error: 'Failed to determine domain type.', details: error.message }, 500);
            }
        }
    );
};
