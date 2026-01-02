import Papa from 'papaparse';
import { SafePipelineConfigSchema, SafePipelineConfig } from '../../config/safeSchema.js';
import { getConfig } from '../../getConfig.js';
import { CONFIG_DOCUMENTATION } from '../../generated/ConfigDocumentation.js';
import { getUniqueRows } from '../../utils/getUniqueRows.js';

export class GenerationService {

    parseSampleData(content: string, filename: string): any[] {
        let sampleRows: any[] = [];

        if (filename.endsWith('.json')) {
            try {
                const json = JSON.parse(content);
                sampleRows = Array.isArray(json) ? json : [json];
            } catch (e) {
                throw new Error('Invalid JSON file');
            }
        } else if (filename.endsWith('.csv')) {
            const parsed = Papa.parse(content, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true
            });
            
            if (parsed.data && Array.isArray(parsed.data)) {
                sampleRows = parsed.data;
            }
        }

        if (sampleRows.length > 0) {
            return getUniqueRows(sampleRows, 10);
        }

        return [];
    }

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
                text: `Sample Data (First ${sampleRows.length} unique rows from uploaded file): \n${JSON.stringify(sampleRows, null, 2)}\nPlease ensure the configuration handles this data structure (e.g. input columns).`
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
