export const GeneratedConfig = ({ config, sampleRowsCount }) => {
    const configJson = JSON.stringify(config, null, 2);
    const configValue = JSON.stringify(config);
    return (<div class="bg-white rounded-lg shadow-lg p-6 border-l-4 border-blue-500">
            <div class="flex justify-between items-start mb-4">
                <h2 class="text-xl font-bold text-gray-800">Generated Configuration</h2>
                <form>
                    <input type="hidden" name="config" value={configValue}/>
                    <button hx-post="/execute" hx-target="#results" hx-indicator="#loading" class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors text-sm font-medium">
                        Execute
                    </button>
                </form>
            </div>
            {sampleRowsCount > 0 && (<div class="mb-4 p-3 bg-blue-50 rounded-md border border-blue-100">
                    <p class="text-sm text-blue-800">
                        <span class="font-semibold">Info:</span> 
                        Analyzed uploaded file and used {sampleRowsCount} unique rows to guide the configuration generation.
                    </p>
                </div>)}
            <div class="bg-gray-900 rounded-md overflow-hidden">
                <pre class="p-4 text-sm text-gray-100 overflow-x-auto"><code>{configJson}</code></pre>
            </div>
        </div>);
};
//# sourceMappingURL=GeneratedConfig.js.map