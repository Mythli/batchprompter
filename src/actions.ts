import { RuntimeConfig } from './types.js';
import { getConfig } from "./getConfig.js";
import { ActionRunner } from './ActionRunner.js';
import { PluginServices } from './plugins/types.js';

export async function runAction(config: RuntimeConfig) {
    const { concurrency } = config;
    
    // Initialize Dependencies
    const { llm, imageSearch, aiImageSearch, fetcher, pluginRegistry } = await getConfig({ concurrency });

    const services: PluginServices = {
        imageSearch,
        aiImageSearch,
        fetcher
    };

    // Run
    const runner = new ActionRunner(config, llm, services, pluginRegistry);
    await runner.run();
}
