import { Hono } from 'hono';
import { ExecutionService } from '../services/ExecutionService.js';

const app = new Hono();
const service = new ExecutionService();

app.post('/run', async (c) => {
    const body = await c.req.json();
    const { config } = body;

    if (!config) return c.json({ error: 'Config is required' }, 400);

    try {
        const result = await service.runConfig(config);
        return c.json({
            results: result.results,
            zip: result.zip
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export default app;
