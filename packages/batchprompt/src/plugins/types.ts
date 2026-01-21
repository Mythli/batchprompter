import { z } from 'zod';
import type OpenAI from 'openai';
import type { StepRow } from '../StepRow.js';
import type { StepConfig, OutputConfig, PartialOutputConfig, GlobalConfig } from "../config/schema.js";
import { mergeOutputConfigs } from "../config/schema.js";
import type { ModelConfig } from "../config/model.js";
import type { LlmClient } from 'llm-fns';
import os from 'os';
import path from 'path';

export interface PluginExecutionContext {
    row: Record<string, any>;
    stepIndex: number;
    pluginIndex: number;
    tempDirectory: string;
    outputDirectory?: string;
    outputBasename?: string;
    outputExtension?: string;
    emit?: (event: string, ...args: any[]) => void;
}

/**
 * A single item in a plugin result.
 * When exploding, each item becomes a separate row.
 */
export interface PluginItem {
    /** The data value for this item */
    data: any;
    /** Content parts specific to this item */
    contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

/**
 * Standardized output from a plugin or LLM operation.
 */
export interface PluginResult {
    /** The complete message history. Always replaces existing history. */
    history: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    /**
     * The result items.
     * - [] (Empty): Signals a filter/drop - row disappears.
     * - [item]: Standard continuation - one row out.
     * - [item1, item2, ...] + explode=false: One row, data combined, contentParts concatenated.
     * - [item1, item2, ...] + explode=true: N rows, each gets its own data + contentParts.
     */
    items: PluginItem[];
}

/**
 * Factory function type for creating LLM clients
 */
export type LlmFactory = (config: Partial<ModelConfig>) => LlmClient;

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
     * Default: pass-through (history unchanged, single null item)
     */
    async prepare(): Promise<PluginResult> {
        return {
            history: await this.stepRow.getPreparedMessages(),
            items: [{ data: null, contentParts: [] }]
        };
    }

    /**
     * Post-LLM execution logic.
     * Default: pass-through (history unchanged, result as single item)
     */
    async postProcess(result: any): Promise<PluginResult> {
        return {
            history: await this.stepRow.getPreparedMessages(),
            items: [{ data: result, contentParts: [] }]
        };
    }
}

/**
 * Default output configuration for plugins.
 * Plugins do NOT inherit from step-level output config to prevent
 * step settings (like mode: "column") from bleeding into plugins.
 */
const DEFAULT_PLUGIN_OUTPUT: OutputConfig = {
    mode: 'ignore',
    explode: false,
    tmpDir: path.join(os.tmpdir(), 'batchprompt'),
};

export abstract class BasePlugin<TBaseConfig = any, TNormalizedConfig = any> {
    abstract readonly type: string;

    abstract getSchema(): z.ZodType<TBaseConfig>;

    /**
     * Normalizes plugin configuration.
     * Plugins use a default output config (mode: 'ignore', explode: false),
     * NOT the step-level output config. This prevents step settings from
     * affecting plugin behavior unexpectedly.
     * 
     * Plugins inherit tmpDir from global config for convenience.
     * 
     * @param config - The raw plugin config
     * @param stepConfig - The step-level config (for step-specific context)
     * @param globalConfig - The full global config (for inheriting defaults)
     */
    normalizeConfig(config: TBaseConfig, stepConfig: StepConfig, globalConfig: GlobalConfig): TNormalizedConfig {
        const pluginOutput = (config as any).output as PartialOutputConfig | undefined;
        
        // Use default plugin output, inheriting tmpDir from global config (not step)
        const baseOutput: OutputConfig = {
            ...DEFAULT_PLUGIN_OUTPUT,
            tmpDir: globalConfig.output?.tmpDir || DEFAULT_PLUGIN_OUTPUT.tmpDir,
        };
        
        const mergedOutput = mergeOutputConfigs(baseOutput, pluginOutput);
        
        return {
            ...config,
            output: mergedOutput
        } as any;
    }

    /**
     * Renders templates and resolves dynamic values for a specific row.
     * 
     * @param stepConfig - The step-level config
     * @param globalConfig - The full global config
     * @param config - The normalized plugin config
     * @param context - The row context for template rendering
     */
    hydrate(stepConfig: StepConfig, globalConfig: GlobalConfig, config: TNormalizedConfig, context: Record<string, any>): Promise<TNormalizedConfig> | TNormalizedConfig {
        return config;
    }

    getStepExtensionSchema(): z.ZodObject<any> | undefined {
        return undefined;
    }

    preprocessStep(stepConfig: StepConfig): StepConfig {
        return stepConfig;
    }

    /**
     * Creates a row-level execution instance for this plugin.
     * Must be implemented by all plugins.
     */
    abstract createRow(stepRow: StepRow, config: TNormalizedConfig): BasePluginRow<TNormalizedConfig>;
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
