import * as fs from 'fs';
import { 
    PluginRegistryV2, 
    PromptLoader,
    RuntimeConfig,
    resolveConfig
} from 'batchprompt';
import { CliConfigBuilder } from './CliConfigBuilder.js';
import { CliPluginAdapter } from './interfaces/CliPluginAdapter.js';
import { FileSystemContentResolver } from './io/FileSystemContentResolver.js';
import { SchemaLoader } from './loaders/SchemaLoader.js';

export class ConfigLoader {
    constructor(
        private registry: PluginRegistryV2,
        private adapters: CliPluginAdapter[]
    ) {}

    async load(
        configPath: string | undefined, 
        options: Record<string, any>, 
        args: string[]
    ): Promise<RuntimeConfig> {
        // 1. Load File Config
        let fileConfig = {};
        if (configPath) {
            const content = fs.readFileSync(configPath, 'utf-8');
            fileConfig = JSON.parse(content);
        }

        // 2. Merge CLI Flags
        const rawConfig = CliConfigBuilder.build(fileConfig, options, args, this.adapters);

        // 3. Create dependencies
        const contentResolver = new FileSystemContentResolver();
        const promptLoader = new PromptLoader(contentResolver);
        const schemaLoader = new SchemaLoader(contentResolver);

        // 4. Use unified resolveConfig
        const runtimeConfig = await resolveConfig(rawConfig, {
            capabilities: { hasSerper: true, hasPuppeteer: true },
            pluginRegistry: this.registry,
            contentResolver: contentResolver,
            promptLoader: promptLoader,
            schemaLoader: schemaLoader
        });

        return runtimeConfig;
    }
}
