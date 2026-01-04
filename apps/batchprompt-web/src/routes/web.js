import { Hono } from 'hono';
import { GenerationService } from '../services/GenerationService.js';
import { ExecutionService } from '../services/ExecutionService.js';
import { Home } from '../views/Home.js';
import { GeneratedConfig } from '../views/GeneratedConfig.js';
import { ExecutionResults } from '../views/ExecutionResults.js';
import { ErrorDisplay } from '../views/ErrorDisplay.js';
import { parseSampleFile } from '../utils/parseSampleFile.js';
const app = new Hono();
const generationService = new GenerationService();
const executionService = new ExecutionService();
app.get('/', (c) => {
    return c.html(<Home />);
});
app.post('/generate', async (c) => {
    try {
        const body = await c.req.parseBody();
        const prompt = body.prompt;
        const file = body.file;
        if (!prompt)
            throw new Error('Prompt is required');
        const sampleRows = file ? await parseSampleFile(file) : [];
        const config = await generationService.generateConfig(prompt, undefined, sampleRows);
        return c.html(<GeneratedConfig config={config} sampleRowsCount={sampleRows.length}/>);
    }
    catch (e) {
        return c.html(<ErrorDisplay message={e.message}/>);
    }
});
app.post('/execute', async (c) => {
    try {
        const body = await c.req.parseBody();
        const configStr = body.config;
        if (!configStr)
            throw new Error('Config is required');
        const config = JSON.parse(configStr);
        const { results, zip } = await executionService.runConfig(config);
        return c.html(<ExecutionResults results={results} zip={zip} config={config}/>);
    }
    catch (e) {
        return c.html(<ErrorDisplay message={e.message}/>);
    }
});
export default app;
//# sourceMappingURL=web.js.map