import { Layout } from './Layout.js';

export const Home = () => (
  <Layout>
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
                    hx-post="/generate" 
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
  </Layout>
);
