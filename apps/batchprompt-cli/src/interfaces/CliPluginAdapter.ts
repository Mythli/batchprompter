import { Command } from 'commander';

export interface CliPluginAdapter {
    /** The plugin type string matching the library schema (e.g. 'webSearch', 'dedupe') */
    pluginType: string;

    /** Register step-specific flags with Commander */
    registerOptionsForStep(program: Command, stepIndex: number): void;

    /**
     * Extract step-level values that map directly to fields on the raw step
     * object rather than to an entry in step.plugins.
     */
    parseStepOptions?(options: Record<string, any>, stepIndex: number): Record<string, any> | null;

    /** 
     * Extract values from parsed CLI options and return a partial config object 
     * that matches the library plugin's Zod schema exactly.
     */
    parseOptions(options: Record<string, any>, stepIndex: number): Record<string, any> | null;
}
