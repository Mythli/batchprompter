import { SafePipelineConfig } from '../../config/safeSchema.js';
import { getConfig } from '../../getConfig.js';
import { ConfigRefiner } from './ConfigRefiner.js';
import { ExecutionService } from './ExecutionService.js';

export class GenerationService {

    async generateConfig(prompt: string, partialConfig?: any, sampleRows?: any[]): Promise<SafePipelineConfig> {
        const { llmFactory } = await getConfig();
        const executionService = new ExecutionService();

        const refiner = new ConfigRefiner(llmFactory, executionService, { maxRetries: 3 });

        const result = await refiner.run({
            prompt,
            sampleRows: sampleRows || [],
            partialConfig
        });

        return result.config;
    }
}
