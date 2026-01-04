import { SafePipelineConfig, getConfig, ConfigRefiner, CONFIG_DOCUMENTATION } from 'batchprompt';
import { ExecutionService } from './ExecutionService.js';

export class GenerationService {

    async generateConfig(prompt: string, partialConfig?: any, sampleRows?: any[]): Promise<SafePipelineConfig> {
        const { llmFactory } = await getConfig();
        const executionService = new ExecutionService();

        const generatorLlm = llmFactory.create({
            model: 'google/gemini-3-flash-preview',
            thinkingLevel: 'high',
            systemParts: [
                { type: 'text', text: 'You are an expert configuration generator for a batch processing pipeline. Generate a valid JSON configuration based on the user request.' },
                { type: 'text', text: 'Here is the documentation for the configuration format:\n\n' + CONFIG_DOCUMENTATION }
            ],
            promptParts: []
        });

        const judgeLlm = llmFactory.create({
            model: 'google/gemini-3-flash-preview',
            thinkingLevel: 'high',
            systemParts: [
                { type: 'text', text: 'You are a judge for a batch processing pipeline configuration. Your job is to determine if the execution results satisfy the user\'s request.' }
            ],
            promptParts: []
        });

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
            if (!config.data) {
                config.data = { rows: [], format: 'json' };
            }
            config.data.rows = sampleRows;
        }

        return config;
    }
}
