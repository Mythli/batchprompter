import { SafePipelineConfigSchema, SafePipelineConfig } from '../../config/safeSchema.js';
import { getConfig } from '../../getConfig.js';
import { CONFIG_DOCUMENTATION } from '../../generated/ConfigDocumentation.js';

export class GenerationService {

    async generateConfig(prompt: string, partialConfig?: any, sampleRows?: any[]): Promise<SafePipelineConfig> {
        const { llmFactory } = await getConfig();

        // Create a generator LLM
        const generatorLlm = llmFactory.create({
            model: 'google/gemini-3-pro-preview',
            systemParts: [
                { type: 'text', text: 'You are an expert configuration generator for a batch processing pipeline. Generate a valid JSON configuration based on the user request.' },
                { type: 'text', text: 'Here is the documentation for the configuration format:\n\n' + CONFIG_DOCUMENTATION }
            ],
            promptParts: []
        });

        const userContent: any[] = [
            { type: 'text', text: `Request: ${prompt}` }
        ];

        if (sampleRows && sampleRows.length > 0) {
            userContent.push({
                type: 'text',
                text: `Sample Data (First ${sampleRows.length} unique rows from uploaded file): \n${JSON.stringify(sampleRows, null, 2)}\n\nIMPORTANT: Use this data ONLY to infer the input schema (e.g. column names). DO NOT embed these specific rows into the configuration. The configuration should be generic and ready to accept a file input matching this structure.`
            });
        }

        if (partialConfig) {
            userContent.push({
                type: 'text',
                text: `Base Configuration (Partial): \n${JSON.stringify(partialConfig, null, 2)}\nPlease merge this into the final result.`
            });
        }

        const config = await generatorLlm.promptZod({ suffix: userContent }, SafePipelineConfigSchema);

        return config;
    }
}
