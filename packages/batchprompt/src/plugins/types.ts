import { z } from 'zod';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from '../core/events.js';
import { ContentResolver } from '../core/io/ContentResolver.js';
import { ModelConfig } from '../config/schemas/model.js';
import { LlmClient } from 'llm-fns';
import { Step } from '../core/Step.js';
import { StepRow } from '../core/StepRow.js';

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

export interface PluginPacket {
    contentParts: any[];
    data: any;
}

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
     * Initialization phase (Static).
     * Called once per step definition.
     * Use this to load files, validate config, and prepare resources.
     */
    init?(step: Step, config: TRawConfig): Promise<TResolvedConfig>;

    /**
     * Execution phase (Dynamic).
     * Called for every row.
     * Use stepRow.createLlm() to get clients.
     * Use stepRow.appendContent() to add to the prompt.
     * Use stepRow.context to read/write data.
     */
    prepare?(stepRow: StepRow, config: TResolvedConfig): Promise<void>;

    /**
     * Post-processing phase.
     * Called after the model generation.
     */
    postProcess?(stepRow: StepRow, config: TResolvedConfig, result: any): Promise<any>;

    // Legacy methods to be removed or adapted
    resolveConfig?(
        rawConfig: TRawConfig,
        row: Record<string, any>,
        inheritedModel: any,
        contentResolver: ContentResolver
    ): Promise<TResolvedConfig>;

    normalizeConfig?(config: TRawConfig, contentResolver: ContentResolver): Promise<TRawConfig>;

    mapStepToConfig?(step: any): TRawConfig | null;

    prepareMessages?(
        messages: any[],
        config: TResolvedConfig,
        context: PluginExecutionContext
    ): Promise<PluginPacket[] | PluginPacket | void>;

    postProcessMessages?(
        response: any,
        history: any[],
        config: TResolvedConfig,
        context: PluginExecutionContext
    ): Promise<any>;
}

export class PluginRegistryV2 {
    private plugins = new Map<string, Plugin>();

    register(plugin: Plugin): void {
        if (this.plugins.has(plugin.type)) {
            throw new Error(`Plugin '${plugin.type}' is already registered`);
        }
        this.plugins.set(plugin.type, plugin);
    }

    /**
     * Overrides an existing plugin or registers a new one.
     * Useful for testing.
     */
    override(plugin: Plugin): void {
        this.plugins.set(plugin.type, plugin);
    }

    get(type: string): Plugin | undefined {
        return this.plugins.get(type);
    }

    getAll(): Plugin[] {
        return Array.from(this.plugins.values());
    }

    /**
     * Dynamically generates a Zod discriminated union schema for all registered plugins.
     */
    getSchema(): z.ZodTypeAny {
        const plugins = this.getAll();
        if (plugins.length === 0) {
            return z.object({ type: z.string() });
        }

        const schemas = plugins.map(p => p.configSchema) as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]];
        
        if (schemas.length === 1) {
            return schemas[0];
        }

        return z.discriminatedUnion('type', schemas);
    }
}

export type LlmFactory = (config: Partial<ModelConfig>) => LlmClient;
