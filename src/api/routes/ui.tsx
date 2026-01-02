import { Hono } from 'hono';
import Papa from 'papaparse';
import { GenerationService } from '../services/GenerationService.js';
import { ExecutionService } from '../services/ExecutionService.js';
import { Home } from '../views/Home.js';
import { GeneratedConfig } from '../views/GeneratedConfig.js';
import { ExecutionResults } from '../views/ExecutionResults.js';
import { ErrorDisplay } from '../views/ErrorDisplay.js';
import { getUniqueRows } from '../../utils/getUniqueRows.js';

const app = new Hono();
const generationService = new GenerationService();
const executionService = new ExecutionService();

async function parseSampleFile(file: File): Promise<any[]> {
    if (!file || file.size === 0) return [];
    const content = await file.text();
    let sampleRows: any[] = [];

    if (file.name.endsWith('.json')) {
        try {
            const json = JSON.parse(content);
            sampleRows = Array.isArray(json) ? json : [json];
        } catch (e) {
            throw new Error('Invalid JSON file');
        }
    } else if (file.name.endsWith('.csv')) {
        const parsed = Papa.parse(content, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true
        });
        
        if (parsed.data && Array.isArray(parsed.data)) {
            sampleRows = parsed.data;
        }
    }

    if (sampleRows.length > 0) {
        return getUniqueRows(sampleRows, 10);
    }

    return [];
}

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
        const { results, zip } = await executionService.runConfig(config);

        return c.html(<ExecutionResults results={results} zip={zip} config={config} />);
    } catch (e: any) {
        return c.html(<ErrorDisplay message={e.message} />);
    }
});

export default app;
