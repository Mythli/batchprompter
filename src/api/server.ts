import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { ConfigService } from './ConfigService.js';

const app = new Hono();
const service = new ConfigService();

app.post('/generate', async (c) => {
    const body = await c.req.json();
    const { prompt, partialConfig } = body;
    
    if (!prompt) return c.json({ error: 'Prompt is required' }, 400);

    try {
        const result = await service.generateConfig(prompt, partialConfig);
        return c.json(result);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

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

app.post('/generate-and-run', async (c) => {
    const body = await c.req.json();
    const { prompt, partialConfig } = body;

    if (!prompt) return c.json({ error: 'Prompt is required' }, 400);

    try {
        // 1. Generate
        const genResult = await service.generateConfig(prompt, partialConfig);
        
        // 2. Run
        const runResult = await service.runConfig(genResult.config);

        return c.json({
            config: genResult.config,
            results: runResult.results,
            zip: runResult.zip
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Export for use or run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const port = 3000;
    console.log(`Server is running on port ${port}`);
    serve({
        fetch: app.fetch,
        port
    });
}

export default app;
