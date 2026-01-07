import { z } from 'zod';
import { PipelineConfigSchema, LlmClientFactory } from 'batchprompt';
import { ConfigRefiner } from './ConfigRefiner.js';

type PipelineConfig = z.infer<typeof PipelineConfigSchema>;

export class GenerationService {
    constructor(
        private llmFactory: LlmClientFactory,
        private refiner: ConfigRefiner
    ) {}

    async generateConfig(prompt: string, partialConfig?: any, sampleRows?: any[]): Promise<PipelineConfig> {
        const result = await this.refiner.run({
            prompt,
            sampleRows: sampleRows || [],
            partialConfig
        });

        if (!result.success || !result.generated) {
            throw new Error(`Failed to generate configuration: ${result.feedback || 'Unknown error'}`);
        }

        const config = result.generated;

        // Inject sample rows into the config so they are available for execution in the UI
        if (sampleRows && sampleRows.length > 0) {
            config.data = sampleRows;
        }

        return config;
    }
}
