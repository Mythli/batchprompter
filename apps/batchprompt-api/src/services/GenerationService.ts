import { z } from 'zod';
import { PipelineConfigSchema, getConfig, ConfigRefiner } from 'batchprompt';
import { ExecutionService } from './ExecutionService.js';

type PipelineConfig = z.infer<typeof PipelineConfigSchema>;

export class GenerationService {

    async generateConfig(prompt: string, partialConfig?: any, sampleRows?: any[]): Promise<PipelineConfig> {
        const { llmFactory } = await getConfig();
        const executionService = new ExecutionService();

        const generatorLlm = llmFactory.create({
            model: 'google/gemini-3-flash-preview',
            thinkingLevel: 'high',
            systemParts: [],
            promptParts: []
        }).getRawClient();

        const judgeLlm = llmFactory.create({
            model: 'google/gemini-3-flash-preview',
            thinkingLevel: 'high',
            systemParts: [],
            promptParts: []
        }).getRawClient();

        const refiner = new ConfigRefiner(generatorLlm, judgeLlm, executionService, { maxRetries: 3 });

        const result = await refiner.run({
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
