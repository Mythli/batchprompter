/*
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { InteractiveElementScreenshoter } from '../lib/InteractiveElementScreenshoter.js';

type Dependencies = {
    app: Hono;
    interactiveElementScreenshoter: InteractiveElementScreenshoter;
};

const schema = z.object({
    url: z.string().url("Please provide a valid URL."),
    maxButtons: z.coerce.number().int().min(0).default(3),
    maxInputs: z.coerce.number().int().min(0).default(3),
    maxLinks: z.coerce.number().int().min(0).default(3),
});

export const registerScreenshotInteractiveElementsRoute = ({ app, interactiveElementScreenshoter }: Dependencies) => {
    app.get(
        '/screenshot-interactive-elements',
        zValidator('query', schema, (result, c) => {
            if (!result.success) {
                return c.json({ error: 'Validation failed', issues: result.error.issues }, 400);
            }
        }),
        async (c) => {
            const { url, ...options } = c.req.valid('query');

            try {
                const result = await interactiveElementScreenshoter.screenshot(url, { ...options, createCompositeImage: true });

                if (result.compositeImageBase64) {
                    // The result is a data URL: `data:image/png;base64,THE_BASE64_STRING`
                    const parts = result.compositeImageBase64.split(',');
                    const mimePart = parts[0];
                    const base64Data = parts[1];

                    if (parts.length !== 2 || mimePart === undefined || base64Data === undefined) {
                         return c.json({ error: 'Failed to process image data.', details: 'Invalid data URL format.' }, 500);
                    }

                    const mimeType = mimePart.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';

                    const buffer = Buffer.from(base64Data, 'base64');

                    c.header('Content-Type', mimeType);
                    return c.body(buffer);
                } else {
                    return c.json({ message: 'No interactive elements found to screenshot.' }, 404);
                }
            } catch (error: any) {
                console.error(`[ScreenshotInteractiveElementsRoute] Error processing ${url}:`, error);
                return c.json({ error: 'Failed to screenshot interactive elements.', details: error.message }, 500);
            }
        }
    );
};
*/
