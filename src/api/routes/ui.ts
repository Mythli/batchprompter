import { Hono } from 'hono';
import { html } from 'hono/html';
import { GenerationService } from '../services/GenerationService.js';
import { ExecutionService } from '../services/ExecutionService.js';
import { getUniqueRows } from '../../utils/getUniqueRows.js';

const app = new Hono();
const generationService = new GenerationService();
const executionService = new ExecutionService();

app.get('/', (c) => {
    return c.html(html`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BatchPrompt</title>
            <script src="https://unpkg.com/htmx.org@1.9.10"></script>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                .htmx-indicator { display: none; }
                .htmx-request .htmx-indicator { display: block; }
                .htmx-request.htmx-indicator { display: block; }
            </style>
        </head>
        <body class="bg-gray-50 min-h-screen p-8">
            <div class="max-w-5xl mx-auto">
                <div class="bg-white rounded-lg shadow-lg p-6 mb-8">
                    <h1 class="text-3xl font-bold text-gray-800 mb-6">BatchPrompt</h1>
                    
                    <form class="space-y-4" hx-encoding="multipart/form-data">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Prompt</label>
                            <textarea 
                                name="prompt" 
                                class="w-full h-32 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Describe what you want to scrape or process..."
                                required
                            ></textarea>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Upload Data (CSV/JSON) - Optional</label>
                            <input 
                                type="file" 
                                name="file" 
                                accept=".csv,.json"
                                class="block w-full text-sm text-gray-500
                                    file:mr-4 file:py-2 file:px-4
                                    file:rounded-md file:border-0
                                    file:text-sm file:font-semibold
                                    file:bg-blue-50 file:text-blue-700
                                    hover:file:bg-blue-100"
                            />
                            <p class="mt-1 text-sm text-gray-500">Up to 10 unique rows will be used to inform the generation.</p>
                        </div>

                        <div class="flex gap-4">
                            <button 
                                hx-post="/ui/generate" 
                                hx-target="#results" 
                                hx-indicator="#loading"
                                class="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors font-medium"
                            >
                                Generate Config
                            </button>
                        </div>
                    </form>
                </div>

                <div id="loading" class="htmx-indicator flex justify-center py-8">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>

                <div id="results" class="space-y-8"></div>
            </div>
        </body>
        </html>
    `);
});

app.post('/generate', async (c) => {
    try {
        const body = await c.req.parseBody();
        const prompt = body.prompt as string;
        const file = body.file as File | undefined;
        
        if (!prompt) throw new Error('Prompt is required');

        let sampleRows: any[] = [];

        if (file && file.size > 0) {
            const content = await file.text();
            if (file.name.endsWith('.json')) {
                try {
                    const json = JSON.parse(content);
                    sampleRows = Array.isArray(json) ? json : [json];
                } catch (e) {
                    throw new Error('Invalid JSON file');
                }
            } else if (file.name.endsWith('.csv')) {
                const lines = content.split(/\r?\n/).filter(l => l.trim());
                if (lines.length > 0) {
                    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                    for(let i=1; i<lines.length; i++) {
                        const values = lines[i].split(',');
                        const row: any = {};
                        headers.forEach((h, idx) => {
                            let val = values[idx]?.trim();
                            if (val && val.startsWith('"') && val.endsWith('"')) {
                                val = val.slice(1, -1);
                            }
                            row[h] = val;
                        });
                        sampleRows.push(row);
                    }
                }
            }

            if (sampleRows.length > 0) {
                sampleRows = getUniqueRows(sampleRows, 10);
            }
        }

        const config = await generationService.generateConfig(prompt, undefined, sampleRows);
        const configJson = JSON.stringify(config, null, 2);
        const configValue = JSON.stringify(config);

        return c.html(html`
            <div class="bg-white rounded-lg shadow-lg p-6 border-l-4 border-blue-500">
                <div class="flex justify-between items-start mb-4">
                    <h2 class="text-xl font-bold text-gray-800">Generated Configuration</h2>
                    <form>
                        <input type="hidden" name="config" value="${configValue}">
                        <button 
                            hx-post="/ui/execute" 
                            hx-target="#results" 
                            hx-indicator="#loading"
                            class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
                        >
                            Execute
                        </button>
                    </form>
                </div>
                ${sampleRows.length > 0 ? html`
                    <div class="mb-4 p-3 bg-blue-50 rounded-md border border-blue-100">
                        <p class="text-sm text-blue-800">
                            <span class="font-semibold">Info:</span> 
                            Analyzed uploaded file and used ${sampleRows.length} unique rows to guide the configuration generation.
                        </p>
                    </div>
                ` : ''}
                <div class="bg-gray-900 rounded-md overflow-hidden">
                    <pre class="p-4 text-sm text-gray-100 overflow-x-auto"><code>${configJson}</code></pre>
                </div>
            </div>
        `);
    } catch (e: any) {
        return c.html(html`
            <div class="bg-red-50 border-l-4 border-red-500 p-4">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                        </svg>
                    </div>
                    <div class="ml-3">
                        <p class="text-sm text-red-700">${e.message}</p>
                    </div>
                </div>
            </div>
        `);
    }
});

app.post('/execute', async (c) => {
    try {
        const body = await c.req.parseBody();
        const configStr = body.config as string;
        
        if (!configStr) throw new Error('Config is required');

        const config = JSON.parse(configStr);
        const { results, zip } = await executionService.runConfig(config);

        // Helper to render table headers
        const headers = results.length > 0 ? Object.keys(results[0]) : [];
        const configJson = JSON.stringify(config, null, 2);
        const configValue = JSON.stringify(config);

        return c.html(html`
            <div class="space-y-8">
                <div class="bg-white rounded-lg shadow-lg p-6 border-l-4 border-green-500">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-xl font-bold text-gray-800">Execution Results</h2>
                        <a href="data:application/zip;base64,${zip}" download="results.zip" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
                            Download Artifacts (ZIP)
                        </a>
                    </div>
                    
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    ${headers.map(h => html`
                                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            ${h}
                                        </th>
                                    `)}
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200">
                                ${results.map(row => html`
                                    <tr>
                                        ${headers.map(h => html`
                                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                ${typeof row[h] === 'object' ? JSON.stringify(row[h]) : row[h]}
                                            </td>
                                        `)}
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                        ${results.length === 0 ? html`<p class="text-center py-4 text-gray-500">No results found</p>` : ''}
                    </div>
                </div>

                <div class="bg-white rounded-lg shadow-lg p-6 border-l-4 border-gray-500">
                    <div class="flex justify-between items-start mb-4">
                        <h2 class="text-xl font-bold text-gray-800">Used Configuration</h2>
                        <form>
                            <input type="hidden" name="config" value="${configValue}">
                            <button 
                                hx-post="/ui/execute" 
                                hx-target="#results" 
                                hx-indicator="#loading"
                                class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
                            >
                                Execute Again
                            </button>
                        </form>
                    </div>
                    <div class="bg-gray-900 rounded-md overflow-hidden">
                        <pre class="p-4 text-sm text-gray-100 overflow-x-auto"><code>${configJson}</code></pre>
                    </div>
                </div>
            </div>
        `);
    } catch (e: any) {
        return c.html(html`
            <div class="bg-red-50 border-l-4 border-red-500 p-4">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                        </svg>
                    </div>
                    <div class="ml-3">
                        <p class="text-sm text-red-700">${e.message}</p>
                    </div>
                </div>
            </div>
        `);
    }
});

export default app;
