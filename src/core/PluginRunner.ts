import OpenAI from 'openai';
import { PluginRegistry } from '../plugins/PluginRegistry.js';
import { PluginConfigDefinition, StepContext } from '../types.js';

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
        const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        const pluginResults: Record<string, any[]> = {};

        for (const def of plugins) {
            const plugin = this.registry.get(def.name);
            if (!plugin) continue;

            // 1. JIT Prepare (Enables Chaining)
            // We pass currentContext which might contain data from previous plugins in this loop
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

            // 3. Handle Results
            if (result.data) {
                // Ensure data is an array (backward compatibility safety, though types say it must be array)
                const dataArray = Array.isArray(result.data) ? result.data : [result.data];

                pluginResults[def.name] = dataArray;

                // Context Merging Strategy for Chaining:
                // If the plugin returned exactly one item, we merge it into the current context
                // so subsequent plugins in this chain can see it.
                // If it returned 0 or >1, we cannot cleanly merge into a single context,
                // so we skip merging. The ActionRunner will handle the branching later.
                if (dataArray.length === 1) {
                    const item = dataArray[0];
                    if (typeof item === 'object' && item !== null) {
                        currentContext = { ...currentContext, ...item };
                    }
                    // Also make it available via namespace
                    currentContext = { ...currentContext, [def.name]: item };
                }
            }

            contentParts.push(...result.contentParts);
        }

        return {
            context: currentContext,
            contentParts,
            pluginResults
        };
    }
}
