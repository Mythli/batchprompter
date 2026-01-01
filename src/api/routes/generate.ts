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
        const result = await generationService.generateConfig(prompt, partialConfig);
        return c.json(result);
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
        const genResult = await generationService.generateConfig(prompt, partialConfig);
        
        // 2. Run
        const runResult = await executionService.runConfig(genResult.config);

        return c.json({
            config: genResult.config,
            results: runResult.results,
            zip: runResult.zip
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export default app;
