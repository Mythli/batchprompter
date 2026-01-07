import { Hono } from 'hono';
import { getDiContainer } from '../getDiContainer.js';
import { Home } from '../views/Home.js';
import { GeneratedConfig } from '../views/GeneratedConfig.js';
import { ExecutionResults } from '../views/ExecutionResults.js';
import { ErrorDisplay } from '../views/ErrorDisplay.js';
import { parseSampleFile } from '../utils/parseSampleFile.js';

const app = new Hono();

app.get('/', (c) => {
    return c.html(<Home />);
});

app.post('/generate', async (c) => {
    try {
        const body = await c.req.parseBody();
        const prompt = body.prompt as string;
        const file = body.file as File | undefined;
        
        if (!prompt) throw new Error('Prompt is required');

        const sampleRows = file ? await parseSampleFile(file) : [];

        const { generationService } = await getDiContainer(process.env);
        const config = await generationService.generateConfig(prompt, undefined, sampleRows);
        
        return c.html(<GeneratedConfig config={config} sampleRowsCount={sampleRows.length} />);
    } catch (e: any) {
        return c.html(<ErrorDisplay message={e.message} />);
    }
});

app.post('/execute', async (c) => {
    try {
        const body = await c.req.parseBody();
        const configStr = body.config as string;
        
        if (!configStr) throw new Error('Config is required');

        const config = JSON.parse(configStr);
        const { executionService } = await getDiContainer(process.env);
        const { results, zip } = await executionService.runConfig(config);

        return c.html(<ExecutionResults results={results} zip={zip} config={config} />);
    } catch (e: any) {
        return c.html(<ErrorDisplay message={e.message} />);
    }
});

export default app;
