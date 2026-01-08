import { StepConfig, GlobalContext } from '../types.js';
import { Step } from './Step.js';

export class Pipeline {
    public readonly steps: Step[] = [];

    constructor(
        private stepConfigs: StepConfig[],
        private globalContext: GlobalContext
    ) {}

    async init() {
        for (let i = 0; i < this.stepConfigs.length; i++) {
            const stepConfig = this.stepConfigs[i];
            const step = new Step(stepConfig, this.globalContext, i);
            await step.init();
            this.steps.push(step);
        }
    }
}
