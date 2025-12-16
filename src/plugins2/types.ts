import { Command } from 'commander';
import { z } from 'zod';
import OpenAI from 'openai';
import { ResolvedOutputConfig, ResolvedModelConfig, ServiceCapabilities } from '../config/types.js';
import { BoundLlmClient } from '../core/BoundLlmClient.js';
import { PuppeteerHelper } from '../utils/puppeteer/PuppeteerHelper.js';
import { ImageSearch } from './image-search/ImageSearch.js';
import { WebSearch } from './web-search/WebSearch.js';
import { Fetcher } from 'llm-fns';
import PQueue from 'p-queue';
import { Cache } from 'cache-manager';

// =============================================================================
// Plugin Services (Dependency Injection)
// =============================================================================

export interface PluginServices {
    puppeteerHelper?: PuppeteerHelper;
    puppeteerQueue?: PQueue;
    fetcher: Fetcher;
    cache?: Cache;
    imageSearch?: ImageSearch;
    webSearch?: WebSearch;
    createLlm: (config: ResolvedModelConfig) => BoundLlmClient;
}

// =============================================================================
// Plugin Execution Context
// =============================================================================

export interface PluginExecutionContext {
    row: Record<string, any>;
    stepIndex: number;
    pluginIndex: number;
    services: PluginServices;
    tempDirectory: string;
    outputDirectory?: string;
    outputBasename?: string;
    outputExtension?: string;
}

// =============================================================================
// Plugin Result
// =============================================================================

export interface PluginPacket {
    data: any;
    contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

export interface PluginResult {
    packets: PluginPacket[];
}

// =============================================================================
// CLI Options (for adapter)
// =============================================================================

export interface CLIOptionDefinition {
    flags: string;
    description: string;
    defaultValue?: any;
    parser?: (value: string) => any;
}

// =============================================================================
// Plugin Interface
// =============================================================================

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

export class PluginRegistry {
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
                            `Step ${stepIdx + 1}: Plugin '${pluginConfig.type}' requires '${cap}' which is not available.`
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
