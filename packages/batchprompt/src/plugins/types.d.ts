import { Command } from 'commander';
import OpenAI from 'openai';
import { z } from 'zod';
import { ServiceCapabilities, ResolvedModelConfig } from '../config/types.js';
import { BoundLlmClient } from '../core/BoundLlmClient.js';
import { BatchPromptEvents } from '../core/events.js';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';
import { Fetcher } from 'llm-fns';
import { Cache } from 'cache-manager';
import { ImageSearch } from './image-search/ImageSearch.js';
import { WebSearch } from './web-search/WebSearch.js';
import PQueue from 'p-queue';
import { ContentResolver } from '../core/io/ContentResolver.js';
export interface PluginPacket {
    /** The data to be merged into the workspace/row (e.g., image metadata) */
    data: any;
    /** The content to be sent to the LLM (e.g., the actual image) */
    contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}
export interface PluginResult {
    packets: PluginPacket[];
}
/**
 * Services available to plugins via dependency injection
 */
export interface PluginServices {
    createLlm: (config: ResolvedModelConfig) => BoundLlmClient;
    puppeteerHelper?: PuppeteerHelper;
    fetcher: Fetcher;
    cache?: Cache;
    imageSearch?: ImageSearch;
    webSearch?: WebSearch;
    puppeteerQueue?: PQueue;
}
/**
 * Context provided to plugin execute method
 */
export interface PluginExecutionContext {
    row: Record<string, any>;
    stepIndex: number;
    pluginIndex: number;
    services: PluginServices;
    tempDirectory: string;
    outputDirectory?: string;
    outputBasename?: string;
    outputExtension?: string;
    emit: (event: keyof BatchPromptEvents, ...args: any[]) => void;
}
/**
 * CLI option definition for plugin registration
 */
export interface CLIOptionDefinition {
    flags: string;
    description: string;
    defaultValue?: any;
    parser?: (value: string) => any;
}
/**
 * Plugin interface for content providers and processors
 */
export interface Plugin<TRawConfig = any, TResolvedConfig = any> {
    /**
     * Unique plugin type identifier (e.g., 'web-search', 'image-search')
     */
    readonly type: string;
    /**
     * Zod schema for validating raw plugin configuration
     */
    readonly configSchema: z.ZodType<TRawConfig>;
    /**
     * CLI option definitions - plugin owns its own flags
     */
    readonly cliOptions: CLIOptionDefinition[];
    /**
     * Check if this plugin requires specific capabilities
     * @returns Array of required capability keys
     */
    getRequiredCapabilities(): (keyof ServiceCapabilities)[];
    /**
     * Parse CLI options into raw plugin config
     * Called by CLIAdapter to extract plugin config from parsed CLI options
     */
    parseCLIOptions(options: Record<string, any>, stepIndex: number): TRawConfig | null;
    /**
     * Optional: Normalize configuration during the loading phase.
     * Useful for resolving static file paths (like schemas) before validation.
     * This runs ONCE during config loading, not per-row.
     */
    normalizeConfig?(config: TRawConfig, contentResolver: ContentResolver): Promise<TRawConfig>;
    /**
     * Resolve raw config (load files, render templates, etc.)
     * Called once per row before execution
     */
    resolveConfig(rawConfig: TRawConfig, row: Record<string, any>, inheritedModel: {
        model: string;
        temperature?: number;
        thinkingLevel?: 'low' | 'medium' | 'high';
    }, contentResolver: ContentResolver): Promise<TResolvedConfig>;
    /**
     * Execute the plugin
     */
    execute(config: TResolvedConfig, context: PluginExecutionContext): Promise<PluginResult>;
}
/**
 * Registry for plugins
 */
export declare class PluginRegistryV2 {
    private plugins;
    register(plugin: Plugin): void;
    get(type: string): Plugin | undefined;
    getAll(): Plugin[];
    /**
     * Register CLI options from all plugins with Commander
     */
    registerCLI(program: Command): void;
    /**
     * Validate that required capabilities are available for all plugins in config
     */
    validateCapabilities(stepConfigs: Array<{
        plugins: Array<{
            type: string;
        }>;
    }>, capabilities: ServiceCapabilities): void;
    private makeStepFlags;
}
//# sourceMappingURL=types.d.ts.map