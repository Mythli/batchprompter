import JSZip from 'jszip';
import { SafePipelineConfigSchema, SafePipelineConfig } from '../../config/safeSchema.js';
import { getConfig } from '../../getConfig.js';

export class GenerationService {
    
    async generateConfig(prompt: string, partialConfig?: any): Promise<{ config: SafePipelineConfig, zip: string }> {
        const { llmFactory } = await getConfig();
        
        // Create a generator LLM
        const generatorLlm = llmFactory.create({
            model: process.env.MODEL || 'google/gemini-3-flash-preview',
            temperature: 0.7,
            systemParts: [{ type: 'text', text: 'You are an expert configuration generator for a batch processing pipeline. Generate a valid JSON configuration based on the user request.' }],
            promptParts: []
        });

        const userContent: any[] = [
            { type: 'text', text: `Request: ${prompt}` }
        ];

        if (partialConfig) {
            userContent.push({
                type: 'text',
                text: `Base Configuration (Partial): \n${JSON.stringify(partialConfig, null, 2)}\nPlease merge this into the final result.`
            });
        }

        const config = await generatorLlm.promptZod({ suffix: userContent }, SafePipelineConfigSchema);

        // Create Zip
        const zip = new JSZip();
        zip.file('config.json', JSON.stringify(config, null, 2));
        zip.file('README.md', `# Generated Configuration\n\nGenerated from prompt: "${prompt}"`);
        
        const zipBase64 = await zip.generateAsync({ type: 'base64' });

        return { config, zip: zipBase64 };
    }
}
