import OpenAI from 'openai';
import { PluginRegistry } from '../plugins/PluginRegistry.js';
import { PluginServices } from '../plugins/types.js';
import { LlmClient } from 'llm-fns';
import { PluginConfigDefinition } from '../types.js';

export class PluginRunner {
    constructor(
        private registry: PluginRegistry,
        private services: PluginServices,
        private llm: LlmClient,
        private globalConfig: { tmpDir: string; concurrency: number }
    ) {}

    async run(
        plugins: PluginConfigDefinition[], 
        initialContext: Record<string, any>,
        stepIndex: number,
        paths: { outputDir?: string; tempDir: string; basename?: string; ext?: string }
    ) {
        let currentContext = { ...initialContext };
        const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        const pluginResults: Record<string, any> = {};

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
                llm: this.llm,
                globalConfig: this.globalConfig,
                services: this.services,
                outputDirectory: paths.outputDir,
                tempDirectory: paths.tempDir,
                outputBasename: paths.basename,
                outputExtension: paths.ext
            });

            // 3. Merge Context
            if (result.data) {
                pluginResults[def.name] = result.data;
                
                // If data is an object, merge it to root context for easy access
                if (typeof result.data === 'object' && !Array.isArray(result.data) && result.data !== null) {
                    currentContext = { ...currentContext, ...result.data };
                }
                
                // Always make it available via {{pluginName}} as well, for consistency/safety
                currentContext = { ...currentContext, [def.name]: result.data };
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
