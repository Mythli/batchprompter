import { EventEmitter } from 'eventemitter3';
import { ActionRunner } from '../ActionRunner.js';
import { PluginRegistryV2 } from '../plugins/types.js';
import { ContentResolver } from '../core/io/ContentResolver.js';
import { BatchPromptEvents } from '../core/events.js';
import { MemoryArtifactHandler, Artifact } from '../handlers/MemoryArtifactHandler.js';
import { ConfigExecutor } from './ConfigRefiner.js';
import { PromptLoader } from '../config/PromptLoader.js';
import { resolveConfig } from '../config/resolveConfig.js';

export class InMemoryConfigExecutor implements ConfigExecutor {
    constructor(
        private actionRunner: ActionRunner,
        private pluginRegistry: PluginRegistryV2,
        private events: EventEmitter<BatchPromptEvents>,
        private contentResolver: ContentResolver
    ) {}

    async runConfig(config: any, initialRows?: any[]): Promise<{ results: any[], artifacts: Artifact[] }> {
        // Create dependencies for resolveConfig
        const promptLoader = new PromptLoader(this.contentResolver);
        
        // Schema loader for memory context
        const schemaLoader = {
            load: async (source: string) => {
                let content: string;
                try {
                    // Try to read from content resolver (if it's a path)
                    content = await this.contentResolver.readText(source);
                } catch {
                    // If read fails, assume it's raw JSON
                    content = source;
                }

                return JSON.parse(content);
            }
        };

        // Inject initialRows if provided
        const configWithData = { ...config };
        if (initialRows && initialRows.length > 0) {
            configWithData.data = initialRows;
        }

        // Use unified resolveConfig
        const runtimeConfig = await resolveConfig(configWithData, {
            capabilities: { hasSerper: true, hasPuppeteer: true },
            pluginRegistry: this.pluginRegistry,
            contentResolver: this.contentResolver,
            promptLoader: promptLoader,
            schemaLoader: schemaLoader
        });
        
        // Capture artifacts in memory (so we don't write to disk during test runs)
        const memoryHandler = new MemoryArtifactHandler(this.events);
        
        // Capture results
        const results: any[] = [];
        const resultHandler = ({ result }: any) => results.push(result);
        this.events.on('row:end', resultHandler);

        try {
            await this.actionRunner.run(runtimeConfig);
        } finally {
            this.events.off('row:end', resultHandler);
        }

        return { results, artifacts: memoryHandler.artifacts };
    }
}
