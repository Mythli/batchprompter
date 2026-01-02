import JSZip from 'jszip';
import { SafePipelineConfigSchema, SafePipelineConfig } from '../config/safeSchema.js';
import { getConfig } from '../../getConfig.js';
import { StepRegistry } from '../../cli/StepRegistry.js';
import { MemoryArtifactHandler } from '../../cli/handlers/MemoryArtifactHandler.js';
import { MemoryContentResolver } from '../../core/io/MemoryContentResolver.js';

export class ConfigService {

    async generateConfig(prompt: string, partialConfig?: any, sampleRows?: any[]): Promise<SafePipelineConfig> {
        const { llmFactory } = await getConfig();

        // Create a generator LLM
        const generatorLlm = llmFactory.create({
            model: 'google/gemini-3-pro-preview',
            systemParts: [{ type: 'text', text: 'You are an expert configuration generator for a batch processing pipeline. Generate a valid JSON configuration based on the user request.' }],
            promptParts: []
        });

        const userContent: any[] = [
            { type: 'text', text: `Request: ${prompt}` }
        ];

        if (sampleRows && sampleRows.length > 0) {
            userContent.push({
                type: 'text',
                text: `Sample Data (First ${sampleRows.length} unique rows from uploaded file): \n${JSON.stringify(sampleRows, null, 2)}\nPlease ensure the configuration handles this data structure.`
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

    async runConfig(config: any): Promise<{ results: any[], artifacts: any[], zip: string }> {
        const contentResolver = new MemoryContentResolver();
        const { actionRunner, pluginRegistry, globalContext } = await getConfig({ contentResolver });

        // Parse and validate the config using the registry logic
        // We pass empty options/args as we are running from object
        const runtimeConfig = await StepRegistry.parseConfig(config, {}, [], pluginRegistry, contentResolver);

        // Capture artifacts in memory
        const memoryHandler = new MemoryArtifactHandler(globalContext.events);

        // Capture results
        const results: any[] = [];
        const resultHandler = ({ result }: any) => results.push(result);
        globalContext.events.on('row:end', resultHandler);

        try {
            await actionRunner.run(runtimeConfig);
        } finally {
            globalContext.events.off('row:end', resultHandler);
        }

        // Create Zip of artifacts
        const zip = new JSZip();

        // Add config and results
        zip.file('config.json', JSON.stringify(config, null, 2));
        zip.file('results.json', JSON.stringify(results, null, 2));

        // Add artifacts
        for (const artifact of memoryHandler.artifacts) {
            // Ensure unique paths or handle directories
            zip.file(artifact.path, artifact.content);
        }

        const zipBase64 = await zip.generateAsync({ type: 'base64' });

        return {
            results,
            artifacts: memoryHandler.artifacts,
            zip: zipBase64
        };
    }
}
