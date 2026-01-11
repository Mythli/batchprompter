import { PipelineItem } from './types.js';
import { StepRow } from './StepRow.js';
import {GlobalConfig, StepConfig} from "./config/schema.js";
import {PluginRegistryV2} from "./plugins/index.js";

export class Step {
    constructor(
        public readonly config: StepConfig,
        public readonly deps: {
            pluginRegistry: PluginRegistryV2
        },
        public readonly stepIndex: number
    ) {}

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
