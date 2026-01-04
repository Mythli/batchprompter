import { Command } from 'commander';
import { PipelineConfig } from '../config/types.js';
import { PluginRegistryV2 } from '../plugins/types.js';
/**
 * Adapts CLI arguments to the canonical PipelineConfig format.
 * Plugins register their own flags - this adapter just coordinates.
 */
export declare class CLIAdapter {
    private pluginRegistry;
    constructor(pluginRegistry: PluginRegistryV2);
    /**
     * Register all CLI options with Commander
     */
    register(program: Command): void;
    private registerCoreOptions;
    /**
     * Parse CLI options and positional arguments into PipelineConfig
     */
    parse(options: Record<string, any>, args: string[]): PipelineConfig;
    private parseStep;
    private toStepKey;
}
//# sourceMappingURL=CLIAdapter.d.ts.map