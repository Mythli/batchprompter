import JSZip from 'jszip';
import { getConfig, StepRegistry, MemoryArtifactHandler, MemoryContentResolver } from 'batchprompt';

export class ExecutionService {

    async runConfig(config: any, initialRows?: any[]): Promise<{ results: any[], artifacts: any[], zip: string }> {
        // Use MemoryContentResolver for API execution
        const contentResolver = new MemoryContentResolver();
        
        // Initialize config with the memory resolver
        const { actionRunner, pluginRegistry, globalContext } = await getConfig({ contentResolver });
        
        // Parse and validate the config using the registry logic
        // We pass empty options/args as we are running from object
        const runtimeConfig = await StepRegistry.parseConfig(config, {}, [], pluginRegistry, contentResolver);

        // Inject initialRows if provided
        if (initialRows && initialRows.length > 0) {
            runtimeConfig.data = initialRows;
        }
        
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
