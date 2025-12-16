import { Command } from 'commander';
import OpenAI from 'openai';
import { z } from 'zod';
import { OutputStrategy, StepContext, ServiceCapabilities, ResolvedModelConfig as LegacyResolvedModelConfig } from '../types.js';
import { ResolvedOutputConfig, ResolvedModelConfig } from '../config/types.js';
import { PuppeteerHelper } from '../utils/puppeteer/PuppeteerHelper.js';
import { Fetcher } from 'llm-fns';
import PQueue from 'p-queue';
import { Cache } from 'cache-manager';
import { BoundLlmClient } from '../core/BoundLlmClient.js';
import { ImageSearch } from './image-search/ImageSearch.js';
import { WebSearch } from './web-search/WebSearch.js';

// =============================================================================
// Legacy Plugin Types (used by old plugin system)
// =============================================================================

/** @deprecated Use PluginServicesV2 instead */
export interface PluginServices {
    puppeteerHelper?: PuppeteerHelper;
    fetcher: Fetcher;
    puppeteerQueue?: PQueue;
}

/** @deprecated Use PluginExecutionContext instead */
export interface PluginContext {
    row: Record<string, any>;
    stepIndex: number;
    config: any;
    output: OutputStrategy;
    
    // Dependency Injection
    stepContext: StepContext;

    // Explicit Paths
    outputDirectory?: string;
    tempDirectory: string;
    outputBasename?: string;
    outputExtension?: string;
}

export interface PluginPacket {
    /** The data to be merged into the workspace/row (e.g., image metadata) */
    data: any;
    /** The content to be sent to the LLM (e.g., the actual image) */
    contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

export interface PluginResult {
    packets: PluginPacket[];
}

/** @deprecated Use Plugin interface instead */
export interface NormalizedPluginConfig {
    config: any;
}

/** @deprecated Use Plugin interface instead */
export interface ContentProviderPlugin {
    name: string;

    register(program: Command): void;
    registerStep(program: Command, stepIndex: number): void;

    /**
     * Parse and validate CLI options to produce a raw configuration.
     * Returns undefined if the plugin is not active for this step.
     * 
     * @param capabilities - Service capabilities for validation. Throw if required service is missing.
     */
    normalize(
        options: Record<string, any>, 
        stepIndex: number, 
        globalConfig: any,
        capabilities: ServiceCapabilities
    ): NormalizedPluginConfig | undefined;

    prepare(config: any, row: Record<string, any>): Promise<any>;
    execute(context: PluginContext): Promise<PluginResult>;
}

// =============================================================================
// New Plugin System (V2)
// =============================================================================

/**
 * Services available to plugins via dependency injection
 */
export interface PluginServicesV2 {
    puppeteerHelper?: PuppeteerHelper;
    puppeteerQueue?: PQueue;
    fetcher: Fetcher;
    cache?: Cache;
    imageSearch?: ImageSearch;
    webSearch?: WebSearch;
    createLlm: (config: ResolvedModelConfig) => BoundLlmClient;
}

/**
 * Context provided to plugin execute method
 */
export interface PluginExecutionContext {
    row: Record<string, any>;
    stepIndex: number;
    pluginIndex: number;
    services: PluginServicesV2;
    tempDirectory: string;
    outputDirectory?: string;
    outputBasename?: string;
    outputExtension?: string;
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
 * New Plugin interface (V2)
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

/**
 * Registry for new-style plugins (V2)
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
