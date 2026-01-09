import { z } from 'zod';
import OpenAI from 'openai';
import { Step } from '../Step.js';
import { StepRow } from '../StepRow.js';
import { ResolvedPluginBase } from '../config/types.js';
import { BatchPromptEvents } from '../events.js';
import { LlmClient } from 'llm-fns';
import { ModelConfig } from '../config/schemas/model.js';
import { StepBaseConfig, GlobalsConfig } from '../config/schema.js';

export interface PluginExecutionContext {
    row: Record<string, any>;
    stepIndex: number;
    pluginIndex: number;
    tempDirectory: string;
    outputDirectory?: string;
    outputBasename?: string;
    outputExtension?: string;
    emit: <K extends keyof BatchPromptEvents>(event: K, ...args: Parameters<BatchPromptEvents[K]>) => void;
}

/**
 * Standardized output from a plugin or LLM operation.
 */
export interface PluginPacket {
    /** 
     * The structured results. 
     * - [] (Empty): Signals a filter/drop.
     * - [item]: Standard continuation.
     * - [item1, item2, ...]: Signals an explosion (if config.explode is true).
     */
    data: any[]; 
    /** Content parts to be added to the prompt for subsequent operations in the step */
    contentParts: any[];
    /** Optional: Overrides the conversation history */
    history?: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    /** Optional artifacts generated during the operation */
    artifacts?: any[];
}

export interface ResolvedPlugin {
    instance: Plugin;
    config: any;
    def: ResolvedPluginBase;
}

export interface Plugin<TRawConfig = any, TResolvedConfig = any, THydratedConfig = any> {
    readonly type: string;
    
    // We keep configSchema for reference/introspection, but getSchema is the primary method now
    readonly configSchema: z.ZodType<TRawConfig>;

    /**
     * Returns the Zod schema used to validate and resolve the plugin configuration.
     * This schema should handle inheritance from the step and global configurations.
     */
    getSchema(step: StepBaseConfig, globals: GlobalsConfig): z.ZodType<TResolvedConfig>;

    /**
     * Hydrates the resolved configuration with runtime data (e.g. rendering Handlebars templates).
     */
    hydrate(config: TResolvedConfig, context: Record<string, any>): Promise<THydratedConfig>;

    /**
     * Prepares data before the LLM call.
     * Must return an array of packets.
     * To do nothing, return [{ data: [null], contentParts: [] }]
     * To filter, return []
     */
    prepare?(stepRow: StepRow, config: THydratedConfig): Promise<PluginPacket[]>;

    /**
     * Processes the result after the LLM call.
     * Must return an array of packets.
     */
    postProcess?(stepRow: StepRow, config: THydratedConfig, result: any): Promise<PluginPacket[]>;
}

export class PluginRegistryV2 {
    private plugins = new Map<string, Plugin>();

    register(plugin: Plugin): void {
        if (this.plugins.has(plugin.type)) {
            throw new Error(`Plugin '${plugin.type}' is already registered`);
        }
        this.plugins.set(plugin.type, plugin);
    }

    override(plugin: Plugin): void {
        this.plugins.set(plugin.type, plugin);
    }

    get(type: string): Plugin | undefined {
        return this.plugins.get(type);
    }

    getAll(): Plugin[] {
        return Array.from(this.plugins.values());
    }
}

export type LlmFactory = (config: Partial<ModelConfig>) => LlmClient;
