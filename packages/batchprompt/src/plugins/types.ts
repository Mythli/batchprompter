import { z } from 'zod';
import OpenAI from 'openai';
import { StepRow } from '../StepRow.js';
import { GlobalsConfig, StepBaseConfig } from '../config/base.js';
import { BatchPromptEvents } from '../events.js';

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

export interface Plugin<TConfig = any> {
    readonly type: string;

    /**
     * Returns the Zod schema used to validate and resolve the plugin configuration.
     * This schema should handle inheritance from the step and global configurations.
     */
    getSchema(step: StepBaseConfig, globals: GlobalsConfig): z.ZodType<TConfig>;

    /**
     * Hydrates the resolved configuration with runtime data (e.g. rendering Handlebars templates).
     */
    hydrate(config: TConfig, context: Record<string, any>): Promise<TConfig>;

    /**
     * Prepares data before the LLM call.
     * Must return an array of packets.
     * To do nothing, return [{ data: [null], contentParts: [] }]
     * To filter, return []
     */
    prepare(stepRow: StepRow, config: TConfig): Promise<PluginPacket[]>;

    /**
     * Processes the result after the LLM call.
     * Must return an array of packets.
     */
    postProcess(stepRow: StepRow, config: TConfig, result: any): Promise<PluginPacket[]>;

    /**
     * Optional: Returns a Zod schema to extend the base step configuration.
     * This allows plugins to add top-level properties to a step (e.g. 'expandUrls').
     */
    getStepExtensionSchema?(): z.ZodType<any>;

    /**
     * Optional: Pre-processes a raw step configuration before validation.
     * Useful for converting shortcuts (like 'expandUrls') into actual plugin configurations.
     * Must return the modified step configuration.
     */
    preprocessStep?(stepConfig: any): any;
}

export abstract class BasePlugin<TConfig = any> implements Plugin<TConfig> {
    abstract readonly type: string;

    abstract getSchema(step: StepBaseConfig, globals: GlobalsConfig): z.ZodType<TConfig>;

    async hydrate(config: TConfig, context: Record<string, any>): Promise<TConfig> {
        return config;
    }

    async prepare(stepRow: StepRow, config: TConfig): Promise<PluginPacket[]> {
        return [{ data: [null], contentParts: [] }];
    }

    async postProcess(stepRow: StepRow, config: TConfig, result: any): Promise<PluginPacket[]> {
        return [{ data: [result], contentParts: [] }];
    }

    getStepExtensionSchema(): z.ZodType<any> | undefined {
        return undefined;
    }

    preprocessStep(stepConfig: any): any {
        return stepConfig;
    }
}

export class PluginRegistryV2 {
    private plugins = new Map<string, Plugin<any>>();

    register(plugin: Plugin<any>): void {
        if (this.plugins.has(plugin.type)) {
            throw new Error(`Plugin '${plugin.type}' is already registered`);
        }
        this.plugins.set(plugin.type, plugin);
    }

    override(plugin: Plugin<any>): void {
        this.plugins.set(plugin.type, plugin);
    }

    get(type: string): Plugin<any> | undefined {
        return this.plugins.get(type);
    }

    getAll(): Plugin<any>[] {
        return Array.from(this.plugins.values());
    }
}
