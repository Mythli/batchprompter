import { PipelineItem } from './types.js';
import { StepRow } from './StepRow.js';
import {StepConfig} from "./config/schema.js";
import {PluginRegistryV2, BasePlugin} from "./plugins/types.js";
import {BatchPromptEvents} from "./events.js";
import {LlmClient} from "llm-fns";

export interface StepPlugin {
    instance: BasePlugin;
    config: any;
}

export class Step {
    public readonly plugins: StepPlugin[];

    constructor(
        public readonly config: StepConfig,
        public readonly deps: {
            pluginRegistry: PluginRegistryV2,
            events: BatchPromptEvents,
            llmFactory: { create: (config: any, messages: any) => any }
        },
        public readonly stepIndex: number
    ) {
        // Normalize plugins once during initialization
        this.plugins = (config.plugins || []).map(pluginConfig => {
            const instance = deps.pluginRegistry.get(pluginConfig.type);
            if (!instance) {
                throw new Error(`Plugin '${pluginConfig.type}' not found in registry.`);
            }
            const normalizedConfig = instance.normalizeConfig(pluginConfig, config);
            return {
                instance,
                config: normalizedConfig
            };
        });
    }

    createRow(item: PipelineItem): StepRow {
        return new StepRow(this, {
            data: item.row,
            context: { ...item.workspace, ...item.row },
            history: item.history,
            content: [],
            originalIndex: item.originalIndex,
            variationIndex: item.variationIndex,
            stepHistory: item.stepHistory
        });
    }
}
