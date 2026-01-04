import { Command } from 'commander';
import { RuntimeConfig } from '../types.js';
import { PluginRegistryV2 } from '../plugins/types.js';
import { ContentResolver } from '../core/io/ContentResolver.js';
export declare class StepRegistry {
    static registerStepArgs(program: Command, registry: PluginRegistryV2): void;
    static parseConfig(fileConfig: any, options: Record<string, any>, positionalArgs: string[], registry: PluginRegistryV2, contentResolver: ContentResolver): Promise<RuntimeConfig>;
}
//# sourceMappingURL=StepRegistry.d.ts.map