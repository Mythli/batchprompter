import { Command } from 'commander';
import { ModelConfig } from '../types.js';
import { CLIOptionDefinition } from '../plugins/types.js';
export interface ModelFlagOptions {
    includePrompt?: boolean;
    includeSystem?: boolean;
    defaultModel?: string;
}
export declare class ModelFlags {
    private defaultModel?;
    constructor(defaultModel?: string);
    /**
     * Returns CLI option definitions for a model configuration.
     * Plugins can spread this into their cliOptions array.
     *
     * @param namespace Prefix for flags (e.g., "image-query" produces --image-query-model)
     * @param options Configuration for which flags to include
     */
    static getOptions(namespace: string, options?: ModelFlagOptions): CLIOptionDefinition[];
    /**
     * Registers model-related flags for a specific namespace.
     * Static because it's used during CLI setup before config is loaded.
     *
     * @param program The Commander instance
     * @param namespace Prefix for flags (e.g., "judge", "feedback", "judge-1"). Empty string for main.
     * @param options Configuration for which flags to include
     */
    static register(program: Command, namespace: string, options?: ModelFlagOptions): void;
    /**
     * Extracts model configuration from the parsed options object.
     * Uses the instance's defaultModel if no specific model is found.
     *
     * Fallback order for inheritable settings (model, temperature, thinking-level):
     * 1. Specific namespace (e.g., `--website-navigator-1-thinking-level`)
     * 2. Fallback namespace (e.g., `--website-navigator-thinking-level`)
     * 3. Global namespace (e.g., `--thinking-level`)
     *
     * Non-inheritable settings (prompt, system) only check specific and fallback namespaces.
     */
    extract(options: Record<string, any>, namespace: string, fallbackNamespace?: string): Partial<ModelConfig>;
    /**
     * Helper to extract model config from options using the plugin's step-suffix pattern.
     * This handles the pattern where step index goes at the END: --image-query-model-1
     *
     * @param options Parsed CLI options
     * @param prefix The camelCase prefix (e.g., 'imageQuery')
     * @param stepIndex The step index
     * @param globalOptions Global options for fallback (model, temperature, thinkingLevel)
     */
    static extractPluginModel(options: Record<string, any>, prefix: string, stepIndex: number, globalOptions?: {
        model?: string;
        temperature?: number;
        thinkingLevel?: string;
    }): {
        model?: string;
        temperature?: number;
        thinkingLevel?: 'low' | 'medium' | 'high';
        prompt?: string;
        system?: string;
    };
}
//# sourceMappingURL=ModelFlags.d.ts.map