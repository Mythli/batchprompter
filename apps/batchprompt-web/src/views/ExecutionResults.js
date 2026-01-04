export const ExecutionResults = ({ results, zip, config }) => {
    const headers = results.length > 0 ? Object.keys(results[0]) : [];
    const configJson = JSON.stringify(config, null, 2);
    const configValue = JSON.stringify(config);
    return (<div class="space-y-8">
            <div class="bg-white rounded-lg shadow-lg p-6 border-l-4 border-green-500">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold text-gray-800">Execution Results</h2>
                    <a href={`data:application/zip;base64,${zip}`} download="results.zip" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
                        Download Artifacts (ZIP)
                    </a>
                </div>
                
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                {headers.map(h => (<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        {h}
                                    </th>))}
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            {results.map(row => (<tr>
                                    {headers.map(h => (<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {typeof row[h] === 'object' ? JSON.stringify(row[h]) : row[h]}
                                        </td>))}
                                </tr>))}
                        </tbody>
                    </table>
                    {results.length === 0 && <p class="text-center py-4 text-gray-500">No results found</p>}
                </div>
            </div>

            <div class="bg-white rounded-lg shadow-lg p-6 border-l-4 border-gray-500">
                <div class="flex justify-between items-start mb-4">
                    <h2 class="text-xl font-bold text-gray-800">Used Configuration</h2>
                    <form>
                        <input type="hidden" name="config" value={configValue}/>
                        <button hx-post="/execute" hx-target="#results" hx-indicator="#loading" class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors text-sm font-medium">
                            Execute Again
                        </button>
                    </form>
                </div>
                <div class="bg-gray-900 rounded-md overflow-hidden">
                    <pre class="p-4 text-sm text-gray-100 overflow-x-auto"><code>{configJson}</code></pre>
                </div>
            </div>
        </div>);
};
//# sourceMappingURL=ExecutionResults.js.map