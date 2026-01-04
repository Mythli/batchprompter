import { Hono } from 'hono';
import { GenerationService } from '../services/GenerationService.js';
import { ExecutionService } from '../services/ExecutionService.js';

const app = new Hono();
const generationService = new GenerationService();
const executionService = new ExecutionService();

app.post('/generate', async (c) => {
    const body = await c.req.json();
    const { prompt, partialConfig } = body;

    if (!prompt) return c.json({ error: 'Prompt is required' }, 400);

    try {
        const config = await generationService.generateConfig(prompt, partialConfig);
        return c.json(config);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export default app;
