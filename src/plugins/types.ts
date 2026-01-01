import { Command } from 'commander';
import OpenAI from 'openai';
import { z } from 'zod';
import { ServiceCapabilities, ResolvedModelConfig } from '../types.js';
import { BoundLlmClient } from '../core/BoundLlmClient.js';
import { BatchPromptEvents } from '../core/events.js';
import { PuppeteerHelper } from '../utils/puppeteer/PuppeteerHelper.js';
import { Fetcher } from 'llm-fns';
import { Cache } from 'cache-manager';
import { ImageSearch } from './image-search/ImageSearch.js';
import { WebSearch } from './web-search/WebSearch.js';
import PQueue from 'p-queue';

// =============================================================================
// Plugin Packet (shared)
// =============================================================================

export interface PluginPacket {
    /** The data to be merged into the workspace/row (e.g., image metadata) */
    data: any;
    /** The content to be sent to the LLM (e.g., the actual image) */
    contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

export interface PluginResult {
    packets: PluginPacket[];
}

// =============================================================================
// Plugin Services (Dependency Injection)
// =============================================================================

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
    
    // Event emitter for artifacts and logs
    // We use 'any' for args here to avoid strict type checking issues with bind() in ActionRunner
    // The implementation in ActionRunner ensures the correct events are emitted.
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

// =============================================================================
// Plugin Interface
// =============================================================================

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
    parseCLIOptions(
        options: Record<string, any>,
        stepIndex: number
    ): TRawConfig | null;

    /**
     * Resolve raw config (load files, render templates, etc.)
     * Called once per row before execution
     */
    resolveConfig(
        rawConfig: TRawConfig,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
    ): Promise<TResolvedConfig>;

    /**
     * Execute the plugin
     */
    execute(
        config: TResolvedConfig,
        context: PluginExecutionContext
    ): Promise<PluginResult>;
}

// =============================================================================
// Plugin Registry
// =============================================================================

/**
 * Registry for plugins
 */
export class PluginRegistryV2 {
    private plugins = new Map<string, Plugin>();

    register(plugin: Plugin): void {
        if (this.plugins.has(plugin.type)) {
            throw new Error(`Plugin '${plugin.type}' is already registered`);
        }
        this.plugins.set(plugin.type, plugin);
    }

    get(type: string): Plugin | undefined {
        return this.plugins.get(type);
    }

    getAll(): Plugin[] {
        return Array.from(this.plugins.values());
    }

    /**
     * Register CLI options from all plugins with Commander
     */
    registerCLI(program: Command): void {
        for (const plugin of this.getAll()) {
            // Global options
            for (const opt of plugin.cliOptions) {
                if (opt.parser) {
                    program.option(opt.flags, opt.description, opt.parser, opt.defaultValue);
                } else if (opt.defaultValue !== undefined) {
                    program.option(opt.flags, opt.description, opt.defaultValue);
                } else {
                    program.option(opt.flags, opt.description);
                }
            }

            // Step-specific options (1-10)
            for (let i = 1; i <= 10; i++) {
                for (const opt of plugin.cliOptions) {
                    const stepFlags = this.makeStepFlags(opt.flags, i);
                    if (opt.parser) {
                        program.option(stepFlags, `${opt.description} for step ${i}`, opt.parser);
                    } else {
                        program.option(stepFlags, `${opt.description} for step ${i}`);
                    }
                }
            }
        }
    }

    /**
     * Validate that required capabilities are available for all plugins in config
     */
    validateCapabilities(
        stepConfigs: Array<{ plugins: Array<{ type: string }> }>,
        capabilities: ServiceCapabilities
    ): void {
        for (let stepIdx = 0; stepIdx < stepConfigs.length; stepIdx++) {
            const step = stepConfigs[stepIdx];
            for (const pluginConfig of step.plugins) {
                const plugin = this.get(pluginConfig.type);
                if (!plugin) {
                    throw new Error(`Unknown plugin type: ${pluginConfig.type}`);
                }

                const required = plugin.getRequiredCapabilities();
                for (const cap of required) {
                    if (!capabilities[cap]) {
                        throw new Error(
                            `Step ${stepIdx + 1}: Plugin '${pluginConfig.type}' requires '${String(cap)}' which is not available.`
                        );
                    }
                }
            }
        }
    }

    private makeStepFlags(flags: string, stepIndex: number): string {
        // Convert "--web-search-query <text>" to "--web-search-query-1 <text>"
        return flags.replace(/^(--[\w-]+)/, `$1-${stepIndex}`);
    }
}
