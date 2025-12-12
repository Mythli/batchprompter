import OpenAI from 'openai';
import { PluginRegistry } from '../plugins/PluginRegistry.js';
import { PluginConfigDefinition, StepContext } from '../types.js';
import { PluginPacket } from '../plugins/types.js';

export class PluginRunner {
    constructor(
        private registry: PluginRegistry,
        private globalConfig: { tmpDir: string; concurrency: number }
    ) {}

    async run(
        plugins: PluginConfigDefinition[],
        initialContext: Record<string, any>,
        stepIndex: number,
        stepContext: StepContext,
        paths: { outputDir?: string; tempDir: string; basename?: string; ext?: string }
    ) {
        let currentContext = { ...initialContext };
        const allPackets: PluginPacket[] = [];

        for (const def of plugins) {
            const plugin = this.registry.get(def.name);
            if (!plugin) continue;

            // 1. JIT Prepare (Enables Chaining)
            const preparedConfig = await plugin.prepare(def.config, currentContext);

            // 2. Execute
            const result = await plugin.execute({
                row: currentContext,
                stepIndex,
                config: preparedConfig,
                output: def.output,
                stepContext: stepContext,
                outputDirectory: paths.outputDir,
                tempDirectory: paths.tempDir,
                outputBasename: paths.basename,
                outputExtension: paths.ext
            });

            // 3. Collect Packets
            allPackets.push(...result.packets);

            // 4. Context Merging Strategy for Chaining (Legacy support for subsequent plugins in same step)
            // If the plugin returned exactly one packet, we merge its data into the current context
            // so subsequent plugins in this chain can see it.
            if (result.packets.length === 1) {
                const packet = result.packets[0];
                if (typeof packet.data === 'object' && packet.data !== null) {
                    currentContext = { ...currentContext, ...packet.data };
                }
                // Also make it available via namespace
                currentContext = { ...currentContext, [def.name]: packet.data };
            }
        }

        return {
            context: currentContext,
            packets: allPackets
        };
    }
}
