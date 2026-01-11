import { z } from 'zod';
import OpenAI from 'openai';
import { StepRow } from '../StepRow.js';
import { BatchPromptEvents } from '../events.js';
import { StepConfig } from "../config/schema.js";

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

/**
 * Base class for row-level plugin execution.
 * Each row gets its own instance, allowing for per-row state.
 */
export abstract class BasePluginRow<TConfig = any> {
    constructor(
        protected readonly stepRow: StepRow,
        protected readonly config: TConfig
    ) {}

    /**
     * Pre-LLM execution logic.
     */
    async prepare(): Promise<PluginPacket[]> {
        return [{ data: [null], contentParts: [] }];
    }

    /**
     * Post-LLM execution logic.
     */
    async postProcess(result: any): Promise<PluginPacket[]> {
        return [{ data: [result], contentParts: [] }];
    }
}

export abstract class BasePlugin<TBaseConfig = any, TNormalizedConfig = any> {
    abstract readonly type: string;

    abstract getSchema(): z.ZodType<TBaseConfig>;

    /**
     * Inherits configuration from the step.
     * By default, merges the output configuration.
     */
    normalizeConfig(config: TBaseConfig, stepConfig: StepConfig): TNormalizedConfig {
        return {
            ...config,
            output: {
                ...stepConfig.output,
                ...(config as any).output
            }
        } as any;
    }

    /**
     * Renders templates and resolves dynamic values for a specific row.
     */
    hydrate(stepConfig: StepConfig, config: TNormalizedConfig, context: Record<string, any>): Promise<TNormalizedConfig> | TNormalizedConfig {
        return config;
    }

    getStepExtensionSchema(): z.ZodObject | undefined {
        return undefined;
    }

    preprocessStep(stepConfig: StepConfig): StepConfig {
        return stepConfig;
    }

    /**
     * Creates a row-level execution instance for this plugin.
     * Override this method to provide custom PluginRow implementations.
     * 
     * Default implementation returns a LegacyPluginRow that wraps
     * the deprecated prepare/postProcess methods for backward compatibility.
     */
    createRow(stepRow: StepRow, config: TNormalizedConfig): BasePluginRow<TNormalizedConfig> {
        return new LegacyPluginRow(stepRow, config, this);
    }

    /**
     * @deprecated Override createRow() and return a BasePluginRow subclass instead.
     * Pre-LLM execution logic.
     */
    async prepare(stepRow: StepRow, config: TNormalizedConfig): Promise<PluginPacket[]> {
        return [{ data: [null], contentParts: [] }];
    }

    /**
     * @deprecated Override createRow() and return a BasePluginRow subclass instead.
     * Post-LLM execution logic.
     */
    async postProcess(stepRow: StepRow, config: TNormalizedConfig, result: any): Promise<PluginPacket[]> {
        return [{ data: [result], contentParts: [] }];
    }
}

/**
 * Default PluginRow implementation that wraps legacy prepare/postProcess methods.
 * Used for backward compatibility with plugins that haven't migrated to the new pattern.
 */
export class LegacyPluginRow<TConfig = any> extends BasePluginRow<TConfig> {
    constructor(
        stepRow: StepRow,
        config: TConfig,
        private plugin: BasePlugin<any, TConfig>
    ) {
        super(stepRow, config);
    }

    async prepare(): Promise<PluginPacket[]> {
        return this.plugin.prepare(this.stepRow, this.config);
    }

    async postProcess(result: any): Promise<PluginPacket[]> {
        return this.plugin.postProcess(this.stepRow, this.config, result);
    }
}

export class PluginRegistryV2 {
    private plugins = new Map<string, BasePlugin<any>>();

    register(plugin: BasePlugin): void {
        if (this.plugins.has(plugin.type)) {
            throw new Error(`Plugin '${plugin.type}' is already registered`);
        }
        this.plugins.set(plugin.type, plugin);
    }

    override(plugin: BasePlugin): void {
        this.plugins.set(plugin.type, plugin);
    }

    get(type: string): BasePlugin | undefined {
        return this.plugins.get(type);
    }

    getAll(): BasePlugin[] {
        return Array.from(this.plugins.values());
    }
}
