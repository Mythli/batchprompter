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

    async prepare(stepRow: StepRow, config: TNormalizedConfig): Promise<PluginPacket[]> {
        return [{ data: [null], contentParts: [] }];
    }

    async postProcess(stepRow: StepRow, config: TNormalizedConfig, result: any): Promise<PluginPacket[]> {
        return [{ data: [result], contentParts: [] }];
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
