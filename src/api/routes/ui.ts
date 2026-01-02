import { Hono } from 'hono';
import { html } from 'hono/html';
import { GenerationService } from '../services/GenerationService.js';
import { ExecutionService } from '../services/ExecutionService.js';

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
                    
                    <form class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Prompt</label>
                            <textarea 
                                name="prompt" 
                                class="w-full h-32 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Describe what you want to scrape or process..."
                                required
                            ></textarea>
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
                            
                            <button 
                                hx-post="/ui/generate-and-run" 
                                hx-target="#results" 
                                hx-indicator="#loading"
                                class="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 transition-colors font-medium"
                            >
                                Generate & Execute
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
        
        if (!prompt) throw new Error('Prompt is required');

        const config = await generationService.generateConfig(prompt);

        return c.html(html`
            <div class="bg-white rounded-lg shadow-lg p-6 border-l-4 border-blue-500">
                <h2 class="text-xl font-bold text-gray-800 mb-4">Generated Configuration</h2>
                <div class="bg-gray-900 rounded-md overflow-hidden">
                    <pre class="p-4 text-sm text-gray-100 overflow-x-auto"><code>${JSON.stringify(config, null, 2)}</code></pre>
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

app.post('/generate-and-run', async (c) => {
    try {
        const body = await c.req.parseBody();
        const prompt = body.prompt as string;
        
        if (!prompt) throw new Error('Prompt is required');

        const config = await generationService.generateConfig(prompt);
        const { results, zip } = await executionService.runConfig(config);

        // Helper to render table headers
        const headers = results.length > 0 ? Object.keys(results[0]) : [];

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
                    <h2 class="text-xl font-bold text-gray-800 mb-4">Used Configuration</h2>
                    <div class="bg-gray-900 rounded-md overflow-hidden">
                        <pre class="p-4 text-sm text-gray-100 overflow-x-auto"><code>${JSON.stringify(config, null, 2)}</code></pre>
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
