import JSZip from 'jszip';
import {
    PluginRegistryV2,
    GlobalContext,
    Pipeline,
    createPipelineSchemaFactory
} from 'batchprompt';

export class ExecutionService {
    constructor(
        private pluginRegistry: PluginRegistryV2,
        private globalContext: GlobalContext,
    ) {}

    async runConfig(config: any, initialRows?: any[]): Promise<{ results: any[], artifacts: any[], zip: string }> {
        // Inject initialRows if provided
        const configWithData = { ...config };
        if (initialRows && initialRows.length > 0) {
            configWithData.data = initialRows;
        }

        // 1. Build Schema & Resolve Config
        const buildSchema = createPipelineSchemaFactory(this.pluginRegistry);
        const schema = await buildSchema(configWithData);
        const runtimeConfig = await schema.parseAsync(configWithData);

        // 2. Run Pipeline
        const pipeline = new Pipeline(this.globalContext);
        const { results, artifacts } = await pipeline.run(runtimeConfig);

        // 3. Create Zip of artifacts
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
