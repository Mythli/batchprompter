import { Pipeline } from './Pipeline.js';
import { Step } from './Step.js';
import { GlobalConfig } from './config/schema.js';
import { BatchPromptDeps } from './getDiContainer.js';

/**
 * Creates a Pipeline from resolved global config and dependencies.
 * This is the main entry point for running a pipeline — consumers
 * don't need to manually create Step instances.
 */
export function createPipeline(deps: BatchPromptDeps, globalConfig: GlobalConfig): Pipeline {
    const stepDeps = {
        pluginRegistry: deps.pluginRegistry,
        events: deps.events,
        llmFactory: deps.llmFactory
    };

    const steps = globalConfig.steps.map((stepConfig, index) =>
        new Step(stepConfig, stepDeps, index, globalConfig)
    );

    return new Pipeline(deps, steps, globalConfig);
}
