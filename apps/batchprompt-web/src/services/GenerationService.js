import { getConfig } from 'batchprompt';
import { ConfigRefiner } from './ConfigRefiner.js';
import { ExecutionService } from './ExecutionService.js';
export class GenerationService {
    async generateConfig(prompt, partialConfig, sampleRows) {
        const { llmFactory } = await getConfig();
        const executionService = new ExecutionService();
        const refiner = new ConfigRefiner(llmFactory, executionService, { maxRetries: 3 });
        const result = await refiner.run({
            prompt,
            sampleRows: sampleRows || [],
            partialConfig
        });
        const config = result.config;
        // Inject sample rows into the config so they are available for execution in the UI
        if (sampleRows && sampleRows.length > 0) {
            if (!config.data) {
                config.data = { rows: [], format: 'json' };
            }
            config.data.rows = sampleRows;
        }
        return config;
    }
}
//# sourceMappingURL=GenerationService.js.map