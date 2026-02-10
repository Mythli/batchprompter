import { Command } from 'commander';

export interface CliPluginAdapter {
    /** The plugin type string (e.g. 'web-search', 'dedupe') */
    pluginType: string;

    /** Register flags with Commander */
    registerOptions(program: Command): void;

    /** Register step-specific flags with Commander */
    registerOptionsForStep(program: Command, stepIndex: number): void;

    /** 
     * Extract values from parsed CLI options and return a partial config object 
     * that matches the library plugin's Zod schema exactly.
     */
    parseOptions(options: Record<string, any>, stepIndex: number): Record<string, any> | null;
}
