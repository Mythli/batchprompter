import JSZip from 'jszip';
import { 
    ActionRunner, 
    PluginRegistryV2, 
    GlobalContext, 
    ContentResolver, 
    InMemoryConfigExecutor 
} from 'batchprompt';

export class ExecutionService {
    constructor(
        private actionRunner: ActionRunner,
        private pluginRegistry: PluginRegistryV2,
        private globalContext: GlobalContext,
        private contentResolver: ContentResolver
    ) {}

    async runConfig(config: any, initialRows?: any[]): Promise<{ results: any[], artifacts: any[], zip: string }> {
        // Use InMemoryConfigExecutor to handle config resolution and execution
        const executor = new InMemoryConfigExecutor(
            this.actionRunner,
            this.pluginRegistry,
            this.globalContext.events,
            this.contentResolver
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
