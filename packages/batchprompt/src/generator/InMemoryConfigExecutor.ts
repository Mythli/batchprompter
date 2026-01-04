import { EventEmitter } from 'eventemitter3';
import { ActionRunner } from '../ActionRunner.js';
import { PluginRegistry } from '../plugins/PluginScope.js';
import { ContentResolver } from '../core/io/ContentResolver.js';
import { BatchPromptEvents } from '../core/events.js';
import { MemoryArtifactHandler } from '../handlers/MemoryArtifactHandler.js';
import { StepRegistry } from '../cli/StepRegistry.js';
import { ConfigExecutor } from './ConfigRefiner.js';

export class InMemoryConfigExecutor implements ConfigExecutor {
    constructor(
        private actionRunner: ActionRunner,
        private pluginRegistry: PluginRegistry,
        private events: EventEmitter<BatchPromptEvents>,
        private contentResolver: ContentResolver
    ) {}

    async runConfig(config: any, initialRows?: any[]): Promise<{ results: any[] }> {
        // Parse and validate the config using the registry logic
        // We pass empty options/args as we are running from object
        const runtimeConfig = await StepRegistry.parseConfig(config, {}, [], this.pluginRegistry, this.contentResolver);

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
            // MemoryArtifactHandler doesn't expose an 'off' method in its current interface,
            // but since we create a new one each time, it's fine as long as we don't leak listeners.
            // Note: MemoryArtifactHandler binds to events in constructor. 
            // Ideally, it should have a dispose method. For now, we rely on it being short-lived.
        }

        return { results };
    }
}
