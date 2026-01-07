import JSZip from 'jszip';
import { getDiContainer, InMemoryConfigExecutor, MemoryContentResolver } from 'batchprompt';

export class ExecutionService {

    async runConfig(config: any, initialRows?: any[]): Promise<{ results: any[], artifacts: any[], zip: string }> {
        // Use MemoryContentResolver for API execution
        const contentResolver = new MemoryContentResolver();

        // Initialize config with the memory resolver
        const { actionRunner, pluginRegistry, globalContext } = await getDiContainer({ contentResolver });

        // Use InMemoryConfigExecutor to handle config resolution and execution
        const executor = new InMemoryConfigExecutor(
            actionRunner,
            pluginRegistry,
            globalContext.events,
            contentResolver
        );

        // Execute
        const { results, artifacts } = await executor.runConfig(config, initialRows);

        // Create Zip of artifacts
        const zip = new JSZip();

        // Add config and results
        zip.file('config.json', JSON.stringify(config, null, 2));
        zip.file('results.json', JSON.stringify(results, null, 2));

        // Add artifacts
        for (const artifact of artifacts) {
            // Ensure unique paths or handle directories
            zip.file(artifact.path, artifact.content);
        }

        const zipBase64 = await zip.generateAsync({ type: 'base64' });

        return {
            results,
            artifacts,
            zip: zipBase64
        };
    }
}
