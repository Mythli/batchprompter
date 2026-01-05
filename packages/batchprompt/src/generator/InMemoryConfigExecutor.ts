import { EventEmitter } from 'eventemitter3';
import { ActionRunner } from '../ActionRunner.js';
import { PluginRegistryV2 } from '../plugins/types.js';
import { ContentResolver } from '../core/io/ContentResolver.js';
import { BatchPromptEvents } from '../core/events.js';
import { MemoryArtifactHandler } from '../handlers/MemoryArtifactHandler.js';
import { ConfigExecutor } from './ConfigRefiner.js';
import { ConfigResolver } from '../config/ConfigResolver.js';
import { PromptLoader } from '../config/PromptLoader.js';

export class InMemoryConfigExecutor implements ConfigExecutor {
    constructor(
        private actionRunner: ActionRunner,
        private pluginRegistry: PluginRegistryV2,
        private events: EventEmitter<BatchPromptEvents>,
        private contentResolver: ContentResolver
    ) {}

    async runConfig(config: any, initialRows?: any[]): Promise<{ results: any[] }> {
        // Create dependencies for ConfigResolver
        const promptLoader = new PromptLoader(this.contentResolver);
        
        // Simple schema loader for memory context
        const schemaLoader = {
            load: async (source: string) => {
                try {
                    // Try to read from content resolver (if it's a path)
                    const content = await this.contentResolver.readText(source);
                    return JSON.parse(content);
                } catch {
                    // If read fails, assume it's raw JSON
                    return JSON.parse(source);
                }
            }
        };

        const resolver = new ConfigResolver({
            capabilities: { hasSerper: true, hasPuppeteer: true }, // Assume full capabilities for generation
            pluginRegistry: this.pluginRegistry,
            contentResolver: this.contentResolver,
            promptLoader: promptLoader,
            schemaLoader: schemaLoader
        });

        // Parse and validate the config
        const runtimeConfig = await resolver.resolve(config);

        // Inject initialRows if provided
        if (initialRows && initialRows.length > 0) {
            runtimeConfig.data = initialRows;
        }
        
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
            // We don't need to explicitly clear memoryHandler as it's garbage collected,
            // but we should ensure it stops listening if it hasn't already.
            // Note: MemoryArtifactHandler binds to events in constructor. 
            // Ideally, it should have a dispose method. For now, we rely on it being short-lived.
        }

        return { results };
    }
}
