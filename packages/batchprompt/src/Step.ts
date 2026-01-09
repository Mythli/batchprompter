import { StepConfig, GlobalContext, PipelineItem } from './types.js';
import { StepRow } from './StepRow.js';

export class Step {
    constructor(
        public readonly config: StepConfig,
        public readonly globalContext: GlobalContext,
        public readonly stepIndex: number
    ) {}

    async init() {
        // No initialization needed anymore as plugins are resolved in the schema phase
        // and hydrated in the StepRow phase.
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
