import { EventEmitter } from 'eventemitter3';
import { ActionRunner } from '../ActionRunner.js';
import { PluginRegistryV2 } from '../plugins/types.js';
import { BatchPromptEvents } from '../events.js';
import { MemoryArtifactHandler, Artifact } from '../MemoryArtifactHandler.js';
import { ConfigExecutor } from './ConfigRefiner.js';
import { resolveConfig } from '../config/resolveConfig.js';

export class InMemoryConfigExecutor implements ConfigExecutor {
    constructor(
        private actionRunner: ActionRunner,
        private pluginRegistry: PluginRegistryV2,
        private events: EventEmitter<BatchPromptEvents>
    ) {}

    async runConfig(config: any, initialRows?: any[]): Promise<{ results: any[], artifacts: Artifact[] }> {
        // Inject initialRows if provided
        const configWithData = { ...config };
        if (initialRows && initialRows.length > 0) {
            configWithData.data = initialRows;
        }

        // Use unified resolveConfig
        const runtimeConfig = await resolveConfig(configWithData, {
            pluginRegistry: this.pluginRegistry
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
