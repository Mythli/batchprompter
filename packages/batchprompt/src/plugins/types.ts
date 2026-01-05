import OpenAI from 'openai';
import { z } from 'zod';
import { ServiceCapabilities, ResolvedModelConfig } from '../config/types.js';
import { BoundLlmClient } from '../core/BoundLlmClient.js';
import { BatchPromptEvents } from '../core/events.js';
import { PuppeteerHelper } from '../utils/puppeteer/PuppeteerHelper.js';
import { Fetcher } from 'llm-fns';
import { Cache } from 'cache-manager';
import { ImageSearch } from './image-search/ImageSearch.js';
import { WebSearch } from './web-search/WebSearch.js';
import PQueue from 'p-queue';
import { ContentResolver } from '../core/io/ContentResolver.js';

// =============================================================================
// Execution Contexts
// =============================================================================

export interface StepExecutionContext {
    row: Record<string, any>;
    workspace: Record<string, any>;
    stepIndex: number;
    rowIndex: number;
    history: any[];
}

export interface StepHandlers {
    /** Runs before step execution. Can modify context. */
    prepare?: (context: StepExecutionContext) => Promise<void>;

    /** Runs to verify content. Returns validity and feedback. */
    verify?: (content: any, context: StepExecutionContext) => Promise<{ isValid: boolean; feedback?: string }>;

    /** Runs after step execution. Can save artifacts, modify result, etc. */
    process?: (context: StepExecutionContext, result: any) => Promise<void>;
}

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
    emit: (event: keyof BatchPromptEvents, ...args: any[]) => void;
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
     * Check if this plugin requires specific capabilities
     * @returns Array of required capability keys
     */
    getRequiredCapabilities(): (keyof ServiceCapabilities)[];

    /**
     * Optional: Normalize configuration during the loading phase.
     * Useful for resolving static file paths (like schemas) before validation.
     * This runs ONCE during config loading, not per-row.
     */
    normalizeConfig?(
        config: TRawConfig,
        contentResolver: ContentResolver
    ): Promise<TRawConfig>;

    /**
     * Resolve raw config (load files, render templates, etc.)
     * Called once per row before execution
     */
    resolveConfig(
        rawConfig: TRawConfig,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' },
        contentResolver: ContentResolver
    ): Promise<TResolvedConfig>;

    /**
     * Execute the plugin to gather data/content.
     */
    execute(
        config: TResolvedConfig,
        context: PluginExecutionContext
    ): Promise<PluginResult>;

    /**
     * Optional: Transform the prompt content before the model is called.
     * This allows plugins to act as preprocessors (e.g. expanding URLs).
     * 
     * @param parts The current accumulated content parts.
     * @param config The resolved configuration.
     * @param context The execution context.
     * @returns The modified content parts.
     */
    transform?(
        parts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        config: TResolvedConfig,
        context: PluginExecutionContext
    ): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]>;

    /**
     * Optional: Return lifecycle handlers for this step.
     * This allows plugins to inject logic into the execution flow (prepare, verify, process).
     * 
     * @param config The resolved configuration for this plugin instance.
     * @param context The execution context (services, row data, etc.).
     */
    getHandlers?(
        config: TResolvedConfig,
        context: PluginExecutionContext
    ): Partial<StepHandlers> | Promise<Partial<StepHandlers>>;
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
}
