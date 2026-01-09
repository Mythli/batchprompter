import { z } from 'zod';
import { Step } from '../Step.js';
import { StepRow } from '../StepRow.js';
import { ResolvedPluginBase } from '../config/types.js';
import { BatchPromptEvents } from '../events.js';
import { LlmClient } from 'llm-fns';
import { ModelConfig } from '../config/schemas/model.js';

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
    /** The structured data result */
    data: any;
    /** Content parts to be added to the prompt for subsequent operations in the step */
    contentParts: any[];
    /** Optional artifacts generated during the operation */
    artifacts?: any[];
    /** If true, the current execution branch should be dropped */
    filter?: boolean;
}

export interface ResolvedPlugin {
    instance: Plugin;
    config: any;
    def: ResolvedPluginBase;
}

export interface Plugin<TRawConfig = any, TResolvedConfig = any> {
    readonly type: string;
    readonly configSchema: z.ZodType<TRawConfig>;

    init(step: Step, config: TRawConfig): Promise<TResolvedConfig>;

    /**
     * Prepares data before the LLM call.
     */
    prepare?(stepRow: StepRow, config: TResolvedConfig): Promise<PluginPacket | void>;

    /**
     * Processes the result after the LLM call.
     */
    postProcess?(stepRow: StepRow, config: TResolvedConfig, result: any): Promise<PluginPacket | void>;
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

    getSchema(): z.ZodTypeAny {
        const plugins = this.getAll();
        if (plugins.length === 0) {
            return z.object({ type: z.string() });
        }

        const schemas = plugins.map(p => p.configSchema);

        if (schemas.length === 1) {
            return schemas[0];
        }

        // @ts-ignore - Zod types are complex for dynamic arrays
        return z.discriminatedUnion('type', schemas);
    }
}

export type LlmFactory = (config: Partial<ModelConfig>) => LlmClient;
