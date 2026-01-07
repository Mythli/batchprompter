import { Hono } from 'hono';
import { getDiContainer } from '../getDiContainer.js';

const app = new Hono();

app.post('/run', async (c) => {
    const body = await c.req.json();
    const { config } = body;

    if (!config) return c.json({ error: 'Config is required' }, 400);

    try {
        const { executionService } = await getDiContainer(process.env);
        const result = await executionService.runConfig(config);
        return c.json({
            results: result.results,
            zip: result.zip
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export default app;
