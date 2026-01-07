import { Hono } from 'hono';
import { getDiContainer } from '../getDiContainer.js';

const app = new Hono();

app.post('/generate', async (c) => {
    const body = await c.req.json();
    const { prompt, partialConfig } = body;

    if (!prompt) return c.json({ error: 'Prompt is required' }, 400);

    try {
        const { generationService } = await getDiContainer(process.env);
        const config = await generationService.generateConfig(prompt, partialConfig);
        return c.json(config);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export default app;
