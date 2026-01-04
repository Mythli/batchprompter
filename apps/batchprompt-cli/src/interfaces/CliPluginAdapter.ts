import { Command } from 'commander';
import { Plugin } from 'batchprompt';

export interface CliPluginAdapter {
    /** Reference to the underlying Core logic */
    plugin: Plugin;

    /** Register flags with Commander (e.g. --web-search-query) */
    registerOptions(program: Command): void;

    /** Register step-specific flags with Commander (e.g. --web-search-query-1) */
    registerOptionsForStep(program: Command, stepIndex: number): void;

    /** 
     * Extract values from parsed CLI options and return a partial config object 
     * that matches the Core Plugin's schema.
     */
    parseOptions(options: Record<string, any>, stepIndex: number): Record<string, any> | null;
}
