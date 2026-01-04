import { ResolvedPipelineConfig, ServiceCapabilities } from './types.js';
import { PluginRegistryV2 } from '../plugins/types.js';
import { ContentResolver } from '../core/io/ContentResolver.js';
export interface ConfigResolverDependencies {
    capabilities: ServiceCapabilities;
    pluginRegistry: PluginRegistryV2;
    contentResolver: ContentResolver;
}
export declare class ConfigResolver {
    private deps;
    private promptLoader;
    private schemaLoader;
    private normalizer;
    constructor(deps: ConfigResolverDependencies);
    /**
     * Validate and resolve a raw pipeline configuration
     */
    resolve(rawConfig: unknown): Promise<ResolvedPipelineConfig>;
    private resolveStep;
    private resolvePrompt;
    private resolveModelConfig;
}
//# sourceMappingURL=ConfigResolver.d.ts.map